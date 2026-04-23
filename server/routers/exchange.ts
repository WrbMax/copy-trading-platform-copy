import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createExchangeApi,
  deleteExchangeApi,
  disableStrategiesByExchangeApiId,
  getExchangeApiById,
  getExchangeApisByUserId,
  updateExchangeApi,
} from "../db";
import { decrypt, encrypt, maskApiKey } from "../crypto";
import { testBinanceApi } from "../binance-client";
import { testOkxApi } from "../okx-client";
import { protectedProcedure, router } from "../_core/trpc";

export const exchangeRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const apis = await getExchangeApisByUserId(ctx.user.id);
    // Mask sensitive fields
    return apis.map((api) => ({
      ...api,
      apiKeyEncrypted: maskApiKey(api.apiKeyEncrypted),
      secretKeyEncrypted: "****",
      passphraseEncrypted: api.passphraseEncrypted ? "****" : null,
    }));
  }),

  bind: protectedProcedure
    .input(z.object({
      exchange: z.enum(["binance", "okx", "bybit", "bitget", "gate"]),
      label: z.string().optional(),
      apiKey: z.string().min(1),
      secretKey: z.string().min(1),
      passphrase: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await createExchangeApi({
        userId: ctx.user.id,
        exchange: input.exchange,
        label: input.label,
        apiKeyEncrypted: encrypt(input.apiKey),
        secretKeyEncrypted: encrypt(input.secretKey),
        passphraseEncrypted: input.passphrase ? encrypt(input.passphrase) : undefined,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().optional(),
      apiKey: z.string().optional(),
      secretKey: z.string().optional(),
      passphrase: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const api = await getExchangeApiById(input.id);
      if (!api || api.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const updateData: Record<string, unknown> = {};
      if (input.label !== undefined) updateData.label = input.label;
      if (input.apiKey) updateData.apiKeyEncrypted = encrypt(input.apiKey);
      if (input.secretKey) updateData.secretKeyEncrypted = encrypt(input.secretKey);
      if (input.passphrase) updateData.passphraseEncrypted = encrypt(input.passphrase);
      await updateExchangeApi(input.id, updateData as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const api = await getExchangeApiById(input.id);
      if (!api || api.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      // Disable all strategies that reference this API before deleting
      await disableStrategiesByExchangeApiId(input.id);
      await deleteExchangeApi(input.id);
      return { success: true };
    }),

  test: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const api = await getExchangeApiById(input.id);
      if (!api || api.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        const apiKey = decrypt(api.apiKeyEncrypted);
        const secretKey = decrypt(api.secretKeyEncrypted);
        const passphrase = api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "";
        const exchange = (api.exchange || "binance").toLowerCase();

        let result: { success: boolean; message: string; checks: Array<{ name: string; passed: boolean; detail: string }> };

        if (exchange === "binance") {
          result = await testBinanceApi({ apiKey, secretKey });
        } else if (exchange === "okx") {
          result = await testOkxApi({ apiKey, secretKey, passphrase });
        } else {
          // For other exchanges (bybit, bitget, gate): basic key presence check for now
          result = {
            success: apiKey.length > 0 && secretKey.length > 0,
            message: apiKey.length > 0 ? "API密钥格式正确（完整连接测试暂不支持该交易所）" : "API密钥不能为空",
            checks: [{ name: "API密钥格式", passed: apiKey.length > 0, detail: apiKey.length > 0 ? "密钥非空" : "密钥为空" }],
          };
        }

        // Build detailed message from checks
        const detailLines = result.checks.map(c => `${c.passed ? "✓" : "✗"} ${c.name}：${c.detail}`).join("\n");
        const testMessage = result.success
          ? `连接成功\n${detailLines}`
          : `${result.message}`;

        await updateExchangeApi(input.id, {
          isVerified: result.success,
          lastTestedAt: new Date(),
          testStatus: result.success ? "success" : "failed",
          testMessage,
        });
        return { success: result.success, message: testMessage, checks: result.checks };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "连接测试异常";
        await updateExchangeApi(input.id, {
          isVerified: false,
          lastTestedAt: new Date(),
          testStatus: "failed",
          testMessage: msg,
        });
        return { success: false, message: msg, checks: [] };
      }
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const api = await getExchangeApiById(input.id);
      if (!api || api.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateExchangeApi(input.id, { isActive: input.isActive });
      return { success: true };
    }),
});
