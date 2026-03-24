import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addFundTransaction,
  createDeposit,
  createWithdrawal,
  getSystemConfig,
  getUserById,
  listDeposits,
  listFundTransactions,
  listWithdrawals,
  setSystemConfig,
  listSystemConfig,
  updateDeposit,
  updateUser,
  updateWithdrawal,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";
import {
  getOrCreateDepositAddress,
  getWalletStatus,
  initHDWallet,
  importHDWallet,
  scanDeposits,
  collectDeposits,
  getUSDTBalance,
  getBNBBalance,
  startAutoScan,
  stopAutoScan,
} from "../bsc-wallet";

export const fundsRouter = router({
  myBalance: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    return { balance: user?.balance ?? "0" };
  }),

  // Each user gets their own unique deposit address
  depositAddress: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Check if HD wallet is initialized
      const walletStatus = await getWalletStatus();
      if (!walletStatus.initialized) {
        return {
          address: null,
          network: "BSC (BEP-20)",
          token: "USDT",
          message: "充值系统正在初始化中，请稍后再试",
        };
      }

      // Get or create user's unique deposit address
      const addrData = await getOrCreateDepositAddress(ctx.user.id);
      return {
        address: addrData.address,
        network: "BSC (BEP-20)",
        token: "USDT",
        message: "请向此地址转入 USDT (BEP-20)，系统将自动检测到账",
      };
    } catch (error: any) {
      console.error("[Funds] Failed to get deposit address:", error);
      return {
        address: null,
        network: "BSC (BEP-20)",
        token: "USDT",
        message: "获取充值地址失败，请联系管理员",
      };
    }
  }),

  // User can still manually submit deposit proof (for cases where auto-detection fails)
  submitDeposit: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      txHash: z.string().optional(),
      fromAddress: z.string().optional(),
      proofNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      let toAddress = "";
      try {
        const addrData = await getOrCreateDepositAddress(ctx.user.id);
        toAddress = addrData.address;
      } catch {}
      await createDeposit({
        userId: ctx.user.id,
        amount: input.amount.toFixed(8),
        txHash: input.txHash,
        fromAddress: input.fromAddress,
        toAddress,
        proofNote: input.proofNote || "用户手动提交",
      });
      return { success: true };
    }),

  submitWithdrawal: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      toAddress: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const minAmount = parseFloat((await getSystemConfig("withdrawal_min_amount")) ?? "10");
      if (input.amount < minAmount) throw new TRPCError({ code: "BAD_REQUEST", message: `最低提现金额为 ${minAmount} USDT` });

      const feeRate = parseFloat((await getSystemConfig("withdrawal_fee_rate")) ?? "0.01");
      const fee = input.amount * feeRate;
      const netAmount = input.amount - fee;
      const balance = parseFloat(user.balance || "0");
      if (balance < input.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "余额不足" });

      const newBalance = balance - input.amount;
      await updateUser(ctx.user.id, { balance: newBalance.toFixed(8) });
      await createWithdrawal({
        userId: ctx.user.id,
        amount: input.amount.toFixed(8),
        fee: fee.toFixed(8),
        netAmount: netAmount.toFixed(8),
        toAddress: input.toAddress,
        network: "BSC",
      });
      await addFundTransaction({
        userId: ctx.user.id,
        type: "withdrawal",
        amount: (-input.amount).toFixed(8),
        balanceAfter: newBalance.toFixed(8),
        note: `提现申请 ${input.amount} USDT`,
      });
      return { success: true };
    }),

  myDeposits: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listDeposits(ctx.user.id, input.page, input.limit);
    }),

  myWithdrawals: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listWithdrawals(ctx.user.id, input.page, input.limit);
    }),

  myTransactions: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listFundTransactions(ctx.user.id, input.page, input.limit);
    }),

  // ─── Admin ─────────────────────────────────────────────────────────────────

  adminDeposits: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listDeposits(undefined, input.page, input.limit);
    }),

  adminWithdrawals: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listWithdrawals(undefined, input.page, input.limit);
    }),

  adminAllTransactions: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listFundTransactions(undefined, input.page, input.limit);
    }),

  adminReviewDeposit: adminProcedure
    .input(z.object({
      depositId: z.number(),
      approved: z.boolean(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const deposit = (await listDeposits(undefined, 1, 10000)).items.find((d) => d.id === input.depositId);
      if (!deposit) throw new TRPCError({ code: "NOT_FOUND" });
      if (deposit.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该申请已处理" });

      await updateDeposit(input.depositId, {
        status: input.approved ? "approved" : "rejected",
        reviewedBy: ctx.user.id,
        reviewNote: input.reviewNote,
        reviewedAt: new Date(),
      });

      if (input.approved) {
        const user = await getUserById(deposit.userId);
        if (user) {
          const newBalance = parseFloat(user.balance || "0") + parseFloat(deposit.amount);
          await updateUser(deposit.userId, { balance: newBalance.toFixed(8) });
          await addFundTransaction({
            userId: deposit.userId,
            type: "deposit",
            amount: deposit.amount,
            balanceAfter: newBalance.toFixed(8),
            relatedId: deposit.id,
            note: `充值审核通过`,
          });
        }
      }
      return { success: true };
    }),

  adminReviewWithdrawal: adminProcedure
    .input(z.object({
      withdrawalId: z.number(),
      approved: z.boolean(),
      txHash: z.string().optional(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const withdrawal = (await listWithdrawals(undefined, 1, 10000)).items.find((w) => w.id === input.withdrawalId);
      if (!withdrawal) throw new TRPCError({ code: "NOT_FOUND" });
      if (withdrawal.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该申请已处理" });

      if (input.approved) {
        await updateWithdrawal(input.withdrawalId, {
          status: "completed",
          txHash: input.txHash,
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
        });
        // Record completion note in fund transactions (balance was already deducted on submission)
        const user = await getUserById(withdrawal.userId);
        if (user) {
          await addFundTransaction({
            userId: withdrawal.userId,
            type: "withdrawal",
            amount: "0",
            balanceAfter: user.balance || "0",
            relatedId: withdrawal.id,
            note: `提现审核通过，已打款 ${withdrawal.netAmount} USDT${input.txHash ? ` (TxHash: ${input.txHash})` : ""}`,
          });
        }
      } else {
        const user = await getUserById(withdrawal.userId);
        if (user) {
          const refund = parseFloat(withdrawal.amount);
          const newBalance = parseFloat(user.balance || "0") + refund;
          await updateUser(withdrawal.userId, { balance: newBalance.toFixed(8) });
          await addFundTransaction({
            userId: withdrawal.userId,
            type: "deposit",
            amount: withdrawal.amount,
            balanceAfter: newBalance.toFixed(8),
            relatedId: withdrawal.id,
            note: `提现申请被拒绝，退款`,
          });
        }
        await updateWithdrawal(input.withdrawalId, {
          status: "rejected",
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
        });
      }
      return { success: true };
    }),

  // ─── Admin: System Config ──────────────────────────────────────────────────

  adminGetConfig: adminProcedure.query(async () => {
    return listSystemConfig();
  }),

  adminSetConfig: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await setSystemConfig(input.key, input.value);
      return { success: true };
    }),

  // ─── Admin: BSC Wallet Management ──────────────────────────────────────────

  adminWalletStatus: adminProcedure.query(async () => {
    return getWalletStatus();
  }),

  adminInitWallet: adminProcedure.mutation(async () => {
    const result = await initHDWallet();
    return { success: true, mainAddress: result.mainAddress, mnemonic: result.mnemonic };
  }),

  adminExportMnemonic: adminProcedure.mutation(async () => {
    const mnemonicEncrypted = await getSystemConfig("hd_mnemonic_encrypted");
    if (!mnemonicEncrypted) throw new TRPCError({ code: "NOT_FOUND", message: "HD钱包尚未初始化" });
    const { decrypt } = await import("../crypto");
    const mnemonic = decrypt(mnemonicEncrypted);
    const { ethers } = await import("ethers");
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
    const mainWallet = hdNode.deriveChild(0);
    return { mnemonic, privateKey: mainWallet.privateKey, address: mainWallet.address };
  }),

  adminImportWallet: adminProcedure
    .input(z.object({ mnemonic: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const result = await importHDWallet(input.mnemonic);
      return { success: true, mainAddress: result.mainAddress };
    }),

  adminSetBscscanKey: adminProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSystemConfig("bscscan_api_key", input.apiKey);
      return { success: true };
    }),

  adminScanDeposits: adminProcedure.mutation(async () => {
    const result = await scanDeposits();
    return result;
  }),

  adminCollectDeposits: adminProcedure.mutation(async () => {
    const result = await collectDeposits();
    return result;
  }),

  adminCheckAddressBalance: adminProcedure
    .input(z.object({ address: z.string().min(10) }))
    .query(async ({ input }) => {
      const usdtBalance = await getUSDTBalance(input.address);
      const bnbBalance = await getBNBBalance(input.address);
      return { usdtBalance, bnbBalance };
    }),

  adminToggleAutoScan: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      if (input.enabled) {
        startAutoScan();
      } else {
        stopAutoScan();
      }
      return { success: true, autoScanActive: input.enabled };
    }),

  // Admin: manually adjust user balance
  adminAdjustBalance: adminProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.number().refine((v) => v !== 0, { message: "调整金额不能为0" }),
      note: z.string().min(1, "请填写操作备注"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });

      const currentBalance = parseFloat(user.balance || "0");
      const newBalance = currentBalance + input.amount;
      if (newBalance < 0) throw new TRPCError({ code: "BAD_REQUEST", message: `余额不足，当前余额 ${currentBalance.toFixed(2)} USDT，无法扣减 ${Math.abs(input.amount).toFixed(2)} USDT` });

      await updateUser(input.userId, { balance: newBalance.toFixed(8) });
      await addFundTransaction({
        userId: input.userId,
        type: "admin_adjust",
        amount: input.amount.toFixed(8),
        balanceAfter: newBalance.toFixed(8),
        note: `管理员调整 [${ctx.user.id}]: ${input.note}`,
      });
      return { success: true, newBalance: newBalance.toFixed(8) };
    }),
});
