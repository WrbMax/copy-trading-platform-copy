import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSignalLog,
  createSignalSource,
  getExchangeApiById,
  getExchangeApisByUserId,
  getEnabledStrategiesForSignal,
  getSignalSourceById,
  getSystemConfig,
  getUserById,
  getUserOrderStats,
  getUserRevenueShareStats,
  getUserStrategies,
  getUserStrategy,
  listAllCopyOrdersWithUser,
  listCopyOrders,
  listCopyOrdersBySignalLog,
  listSignalLogs,
  listSignalSources,
  updateCopyOrder,
  updateSignalLog,
  updateSignalSource,
  upsertUserStrategy,
  createCopyOrder,
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
      signalSource: sources.find((src) => src.id === s.signalSourceId),
      exchangeApi: apis.find((a) => a.id === s.exchangeApiId),
    }));
  }),

  setStrategy: protectedProcedure
    .input(z.object({
      signalSourceId: z.number(),
      exchangeApiId: z.number(),
      multiplier: z.number().min(0.1).max(100),
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
    return getUserOrderStats(ctx.user.id);
  }),

  revenueShareStats: protectedProcedure.query(async ({ ctx }) => {
    return getUserRevenueShareStats(ctx.user.id);
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
    .input(z.object({ page: z.number().default(1), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      return listAllCopyOrdersWithUser(input.page, input.limit);
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
      // Verify webhook secret
      if (source.webhookSecret && source.webhookSecret !== input.secret) {
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

      if (logId) await updateSignalLog(logId, { status: "completed" });
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
      const netPnl = input.realizedPnl - input.fee;
      await updateCopyOrder(input.orderId, {
        closePrice: input.closePrice.toFixed(8),
        closeTime: new Date(),
        realizedPnl: input.realizedPnl.toFixed(8),
        fee: input.fee.toFixed(8),
        netPnl: netPnl.toFixed(8),
        status: "closed",
      });

      // Get order to find trader
      const { items } = await listCopyOrders(undefined, 1, 1000);
      const order = items.find((o) => o.id === input.orderId);
      if (order && netPnl > 0) {
        await processRevenueShare({
          copyOrderId: input.orderId,
          traderId: order.userId,
          netPnl,
        });
        // Update trader's profit stats
        const trader = await getUserById(order.userId);
        if (trader) {
          const newProfit = parseFloat(trader.totalProfit || "0") + netPnl;
          await import("../db").then(({ updateUser }) => updateUser(order.userId, { totalProfit: newProfit.toFixed(8) }));
        }
      } else if (order && netPnl < 0) {
        const trader = await getUserById(order.userId);
        if (trader) {
          const newLoss = parseFloat(trader.totalLoss || "0") + Math.abs(netPnl);
          await import("../db").then(({ updateUser }) => updateUser(order.userId, { totalLoss: newLoss.toFixed(8) }));
        }
      }
      return { success: true };
    }),
});
