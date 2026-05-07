import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSignalLog,
  createSignalSource,
  getExchangeApiById,
  getExchangeApisByUserId,
  getEnabledStrategiesForSignal,
  getSignalSourceById,
  getUserById,
  getUserOrderStats,
  getUserRevenueShareStats,
  getUserStrategies,
  listAllCopyOrdersWithUser,
  listCopyOrders,
  listCopyOrdersBySignalLog,
  listSignalLogs,
  listSignalSources,
  getCopyOrderById,
  updateCopyOrder,
  updateSignalLog,
  updateSignalSource,
  upsertUserStrategy,
  createCopyOrder,
  listRevenueShareRecords,
} from "../db";
import { processRevenueShare } from "../revenue-share";
import { encrypt, decrypt, maskApiKey } from "../crypto";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";
import { reloadSignalSource, getCopyEngineStatus } from "../copy-engine";

export const strategyRouter = router({
  // Public: list active strategies
  list: publicProcedure.query(async () => {
    const sources = await listSignalSources(true);
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      symbol: s.symbol,
      tradingPair: s.tradingPair,
      referencePosition: s.referencePosition,
      expectedMonthlyReturnMin: s.expectedMonthlyReturnMin,
      expectedMonthlyReturnMax: s.expectedMonthlyReturnMax,
      description: s.description,
      isActive: s.isActive,
    }));
  }),

  // User's strategy subscriptions
  myStrategies: protectedProcedure.query(async ({ ctx }) => {
    const strategies = await getUserStrategies(ctx.user.id);
    const sources = await listSignalSources(false);
    const apis = await getExchangeApisByUserId(ctx.user.id);
    return strategies.map((s) => ({
      ...s,
      signalSource: (() => {
        const src = sources.find((src) => src.id === s.signalSourceId);
        if (!src) return undefined;
        // Strip sensitive encrypted credentials from signal source
        const { apiKeyEncrypted, apiSecretEncrypted, passphraseEncrypted, webhookSecret, ...safeSrc } = src as any;
        return safeSrc;
      })(),
      exchangeApi: apis.find((a) => a.id === s.exchangeApiId),
    }));
  }),

  setStrategy: protectedProcedure
    .input(z.object({
      signalSourceId: z.number(),
      exchangeApiId: z.number(),
      multiplier: z.number().min(0.1).max(200),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify exchange API belongs to user
      const api = await getExchangeApiById(input.exchangeApiId);
      if (!api || api.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "交易所API不存在" });
      if (!api.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "交易所API已禁用，请先启用" });

      // Verify signal source exists
      const source = await getSignalSourceById(input.signalSourceId);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "策略不存在" });

      // Balance check: forbid enabling strategy when balance is 0
      if (input.isEnabled) {
        const user = await getUserById(ctx.user.id);
        if (!user || parseFloat(user.balance as string) <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "账户余额不足，请先充值后再开启策略" });
        }
      }

      await upsertUserStrategy({
        userId: ctx.user.id,
        signalSourceId: input.signalSourceId,
        exchangeApiId: input.exchangeApiId,
        multiplier: input.multiplier.toFixed(2),
        isEnabled: input.isEnabled,
      });
      return { success: true };
    }),

  // Orders
  orders: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listCopyOrders(ctx.user.id, input.page, input.limit);
    }),

  orderStats: protectedProcedure.query(async ({ ctx }) => {
    // Read stats directly from database
    // PnL data is kept accurate by the copy-engine which fetches real PnL
    // from exchange API at close time and updates the copy_orders table
    return getUserOrderStats(ctx.user.id);
  }),

  revenueShareStats: protectedProcedure.query(async ({ ctx }) => {
    return getUserRevenueShareStats(ctx.user.id);
  }),

  // 用户侧：分享奖流水记录
  myDirectBonusRecords: protectedProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      return listRevenueShareRecords(ctx.user.id, input.page, input.limit, { rewardType: "direct" });
    }),

  // 用户侧：身份奖流水记录（包含 rank 和 same_rank）
  myLevelBonusRecords: protectedProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      return listRevenueShareRecords(ctx.user.id, input.page, input.limit, { rewardTypes: ["rank", "same_rank"] });
    }),

  // Admin: manage signal sources
  adminListSources: adminProcedure.query(async () => {
    const sources = await listSignalSources(false);
    return sources.map((s) => ({
      ...s,
      apiKeyMasked: s.apiKeyEncrypted ? maskApiKey(decrypt(s.apiKeyEncrypted)) : null,
      apiSecretMasked: s.apiSecretEncrypted ? "****" : null,
      passphraseMasked: s.passphraseEncrypted ? "****" : null,
      apiKeyEncrypted: undefined,
      apiSecretEncrypted: undefined,
      passphraseEncrypted: undefined,
    }));
  }),

  adminCreateSource: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      symbol: z.string().min(1),
      tradingPair: z.string().min(1),
      referencePosition: z.number().positive(),
      expectedMonthlyReturnMin: z.number().min(0),
      expectedMonthlyReturnMax: z.number().min(0),
      description: z.string().optional(),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      webhookSecret: z.string().optional(),
      exchange: z.enum(["okx", "binance", "bybit", "bitget", "gate"]).default("okx"),
      passphrase: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await createSignalSource({
        name: input.name,
        symbol: input.symbol,
        tradingPair: input.tradingPair,
        referencePosition: input.referencePosition.toFixed(8),
        expectedMonthlyReturnMin: input.expectedMonthlyReturnMin.toFixed(2),
        expectedMonthlyReturnMax: input.expectedMonthlyReturnMax.toFixed(2),
        description: input.description,
        apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey) : undefined,
        apiSecretEncrypted: input.apiSecret ? encrypt(input.apiSecret) : undefined,
        webhookSecret: input.webhookSecret,
        exchange: input.exchange,
        passphraseEncrypted: input.passphrase ? encrypt(input.passphrase) : undefined,
        isActive: true,
      });
      return { success: true };
    }),

  adminUpdateSource: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      symbol: z.string().optional(),
      tradingPair: z.string().optional(),
      referencePosition: z.number().optional(),
      expectedMonthlyReturnMin: z.number().optional(),
      expectedMonthlyReturnMax: z.number().optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      webhookSecret: z.string().optional(),
      exchange: z.enum(["okx", "binance", "bybit", "bitget", "gate"]).optional(),
      passphrase: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, apiKey, apiSecret, webhookSecret: ws, exchange, passphrase, ...rest } = input;
      const updateData: Record<string, unknown> = {};
      if (rest.name !== undefined) updateData.name = rest.name;
      if (rest.symbol !== undefined) updateData.symbol = rest.symbol;
      if (rest.tradingPair !== undefined) updateData.tradingPair = rest.tradingPair;
      if (rest.referencePosition !== undefined) updateData.referencePosition = rest.referencePosition.toFixed(8);
      if (rest.expectedMonthlyReturnMin !== undefined) updateData.expectedMonthlyReturnMin = rest.expectedMonthlyReturnMin.toFixed(2);
      if (rest.expectedMonthlyReturnMax !== undefined) updateData.expectedMonthlyReturnMax = rest.expectedMonthlyReturnMax.toFixed(2);
      if (rest.description !== undefined) updateData.description = rest.description;
      if (rest.isActive !== undefined) updateData.isActive = rest.isActive;
      if (apiKey !== undefined) updateData.apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;
      if (apiSecret !== undefined) updateData.apiSecretEncrypted = apiSecret ? encrypt(apiSecret) : null;
      if (ws !== undefined) updateData.webhookSecret = ws || null;
      if (exchange !== undefined) updateData.exchange = exchange;
      if (passphrase !== undefined) updateData.passphraseEncrypted = passphrase ? encrypt(passphrase) : null;
      await updateSignalSource(id, updateData as any);
      // Reload the copy engine for this source
      reloadSignalSource(id).catch(console.error);
      return { success: true };
    }),

  adminSignalLogs: adminProcedure
    .input(z.object({ signalSourceId: z.number().optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const result = await listSignalLogs(input.signalSourceId, input.page, input.limit);
      // Attach copy orders (user execution results) to each log entry
      const itemsWithOrders = await Promise.all(
        result.items.map(async (log) => {
          const orders = await listCopyOrdersBySignalLog(log.id);
          return { ...log, copyOrders: orders };
        })
      );
      return { ...result, items: itemsWithOrders };
    }),

  adminAllOrders: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(30),
      userId: z.number().optional(),
      signalSourceId: z.number().optional(),
      exchange: z.string().optional(),
      symbol: z.string().optional(),
      action: z.string().optional(),
      status: z.string().optional(),
      isAbnormal: z.boolean().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      keyword: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, limit, dateFrom, dateTo, ...rest } = input;
      return listAllCopyOrdersWithUser(page, limit, {
        ...rest,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      });
    }),

  adminMarkAbnormal: adminProcedure
    .input(z.object({ orderId: z.number(), isAbnormal: z.boolean(), note: z.string().optional() }))
    .mutation(async ({ input }) => {
      await updateCopyOrder(input.orderId, { isAbnormal: input.isAbnormal, abnormalNote: input.note });
      return { success: true };
    }),

  // Engine status (for admin dashboard)
  adminEngineStatus: adminProcedure.query(() => {
    return getCopyEngineStatus();
  }),

  // Reload a specific signal source in the engine
  adminReloadEngine: adminProcedure
    .input(z.object({ sourceId: z.number() }))
    .mutation(async ({ input }) => {
      await reloadSignalSource(input.sourceId);
      return { success: true };
    }),

  // Webhook: receive signal from external source
  receiveSignal: publicProcedure
    .input(z.object({
      signalSourceId: z.number(),
      secret: z.string(),
      action: z.enum(["open_long", "open_short", "close_long", "close_short", "close_all"]),
      symbol: z.string(),
      quantity: z.number().positive(),
      price: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const source = await getSignalSourceById(input.signalSourceId);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "信号源不存在" });
      if (!source.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "信号源已停用" });
      // Require webhookSecret — sources without a configured secret reject all external signals
      if (!source.webhookSecret) {
        throw new TRPCError({ code: "FORBIDDEN", message: "该信号源未配置 Webhook 密钥，无法接收外部信号" });
      }
      if (source.webhookSecret !== input.secret) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "信号验证失败" });
      }

      // Create signal log
      const logId = await createSignalLog({
        signalSourceId: input.signalSourceId,
        action: input.action,
        symbol: input.symbol,
        quantity: input.quantity.toFixed(8),
        price: input.price?.toFixed(8),
        rawPayload: JSON.stringify(input),
        status: "processing",
        processedAt: new Date(),
      });

      // Find all users with this strategy enabled
      const userStrategies = await getEnabledStrategiesForSignal(input.signalSourceId);

      // Create copy orders for each user (simulation - real would call exchange APIs)
      let successCount = 0;
      for (const us of userStrategies) {
        try {
          const api = await getExchangeApiById(us.exchangeApiId);
          const actualQty = parseFloat(input.quantity.toFixed(8)) * parseFloat(us.multiplier);
          await createCopyOrder({
            userId: us.userId,
            signalLogId: logId,
            signalSourceId: input.signalSourceId,
            exchangeApiId: us.exchangeApiId,
            exchange: api?.exchange || "binance",
            symbol: input.symbol,
            action: input.action,
            multiplier: us.multiplier,
            signalQuantity: input.quantity.toFixed(8),
            actualQuantity: actualQty.toFixed(8),
            openPrice: input.price?.toFixed(8),
            openTime: new Date(),
            status: "open",
          });
          successCount++;
        } catch (err) {
          console.error(`[Signal] Failed to create copy order for user ${us.userId}:`, err);
        }
      }

      const failCount = userStrategies.length - successCount;
      if (logId) await updateSignalLog(logId, {
        status: "completed",
        totalUsers: userStrategies.length,
        successCount,
        failCount,
      });
      return { success: true, processedUsers: successCount };
    }),

  // Simulate close order with PnL (for demo/testing)
  simulateClose: adminProcedure
    .input(z.object({
      orderId: z.number(),
      closePrice: z.number(),
      realizedPnl: z.number(),
      fee: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      // Idempotency check — prevent duplicate revenue share if order is already closed
      const order = await getCopyOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (order.status === "closed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "订单已关闭，请勿重复操作" });
      }

      const netPnl = input.realizedPnl - input.fee;
      await updateCopyOrder(input.orderId, {
        closePrice: input.closePrice.toFixed(8),
        closeTime: new Date(),
        realizedPnl: input.realizedPnl.toFixed(8),
        fee: input.fee.toFixed(8),
        netPnl: netPnl.toFixed(8),
        status: "closed",
      });

      if (netPnl > 0) {
        await processRevenueShare({
          copyOrderId: input.orderId,
          traderId: order.userId,
          netPnl,
        });
      }
      return { success: true };
    }),
});
