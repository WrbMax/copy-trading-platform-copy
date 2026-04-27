import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addFundTransaction,
  adjustBalance,
  deductBalanceForWithdrawal,
  createWithdrawal,
  getDepositById,
  getSystemConfig,
  getUserById,
  listDeposits,
  listFundTransactions,
  listWithdrawals,
  listSystemConfig,
  setSystemConfig,
  updateDeposit,
  updateWithdrawal,
  getWithdrawalById,
  claimWithdrawalForProcessing,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";
import {
  getOrCreateDepositAddress,
  getWalletStatus,
  initHDWallet,
  importHDWallet,
  resetAndImportHDWallet,
  scanDeposits,
  collectDeposits,
  getUSDTBalance,
  getBNBBalance,
  startAutoScan,
  stopAutoScan,
  sendUsdtFromMaster,
} from "../bsc-wallet";

// ─── Auto-payout helper ───────────────────────────────────────────────────────
// Default threshold: withdrawals <= this amount are auto-approved & auto-paid
const DEFAULT_AUTO_APPROVE_THRESHOLD = 200;

/**
 * Attempt to execute on-chain payout for a withdrawal.
 * Uses atomic status claim (pending → processing) to prevent duplicate payouts.
 * Returns txHash on success, null if wallet has insufficient funds (caller should leave pending),
 * or 'already_claimed' if another process already owns this withdrawal.
 * Throws on unexpected errors.
 */
async function attemptPayout(withdrawalId: number, toAddress: string, netAmount: number): Promise<string | null | 'already_claimed'> {
  // ── Atomic claim: only one process can proceed ──────────────────────────────
  const claimed = await claimWithdrawalForProcessing(withdrawalId);
  if (!claimed) {
    // Another process (retry timer or concurrent admin action) already claimed it
    console.warn(`[Withdrawal] Withdrawal #${withdrawalId} already claimed by another process, skipping.`);
    return 'already_claimed';
  }

  try {
    const txHash = await sendUsdtFromMaster(toAddress, netAmount);
    await updateWithdrawal(withdrawalId, {
      status: "completed",
      txHash,
      reviewedAt: new Date(),
    });
    return txHash;
  } catch (err: any) {
    const msg: string = err.message || "";
    // Insufficient funds → revert to pending so retry timer can pick it up
    if (msg.includes("不足") || msg.includes("insufficient") || msg.includes("Insufficient")) {
      console.warn(`[Withdrawal] Payout deferred (insufficient funds) for withdrawal #${withdrawalId}: ${msg}`);
      await updateWithdrawal(withdrawalId, { status: "pending" });
      return null;
    }
    // Unexpected error → revert to pending and rethrow
    await updateWithdrawal(withdrawalId, { status: "pending" });
    throw err;
  }
}

export const fundsRouter = router({
  // Withdrawal config: fee rate and minimum amount (for frontend display)
  withdrawalConfig: protectedProcedure.query(async () => {
    const feeRate = parseFloat((await getSystemConfig("withdrawal_fee_rate")) ?? "0.01");
    const minAmount = parseFloat((await getSystemConfig("withdrawal_min_amount")) ?? "10");
    return { feeRate, minAmount };
  }),

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

  submitWithdrawal: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      toAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid BSC address format"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const minAmount = parseFloat((await getSystemConfig("withdrawal_min_amount")) ?? "10");
      if (input.amount < minAmount) throw new TRPCError({ code: "BAD_REQUEST", message: `最低提现金额为 ${minAmount} USDT` });

      const feeRate = parseFloat((await getSystemConfig("withdrawal_fee_rate")) ?? "0.01");
      const fee = input.amount * feeRate;
      const netAmount = input.amount - fee;
      // FIX(2026-04-27): Use atomic conditional UPDATE (WHERE balance >= amount) instead of
      // SELECT-then-UPDATE to eliminate TOCTOU race condition under concurrent withdrawal requests.
      // deductBalanceForWithdrawal returns null if balance is insufficient (no deduction performed).
      const newBalanceStr = await deductBalanceForWithdrawal(ctx.user.id, input.amount);
      if (newBalanceStr === null) throw new TRPCError({ code: "BAD_REQUEST", message: "余额不足" });

      // Create withdrawal record
      const withdrawal = await createWithdrawal({
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
        balanceAfter: newBalanceStr,
        note: `提现申请 ${input.amount} USDT`,
      });

      // Auto-approve & auto-payout for small withdrawals
      const autoThreshold = parseFloat(
        (await getSystemConfig("withdrawal_auto_approve_threshold")) ?? String(DEFAULT_AUTO_APPROVE_THRESHOLD)
      );
      if (input.amount <= autoThreshold) {
        const txHash = await attemptPayout(withdrawal.id, input.toAddress, netAmount);
        if (txHash) {
          // Payout succeeded: record completion
          await addFundTransaction({
            userId: ctx.user.id,
            type: "withdrawal",
            amount: "0",
            balanceAfter: newBalanceStr,
            relatedId: withdrawal.id,
            note: `自动提现成功，已打币 ${netAmount.toFixed(8)} USDT (TxHash: ${txHash})`,
          });
          return { success: true, auto: true, txHash };
        }
        // Payout deferred: leave as pending, retry timer will handle it
        return { success: true, auto: false, message: "提现申请已提交，正在等待打币" };
      }

      return { success: true, auto: false };
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
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      keyword: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, limit, dateFrom, dateTo, ...rest } = input;
      return listDeposits(undefined, page, limit, {
        ...rest,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      });
    }),

  adminWithdrawals: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      keyword: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, limit, dateFrom, dateTo, ...rest } = input;
      return listWithdrawals(undefined, page, limit, {
        ...rest,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      });
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
      const deposit = await getDepositById(input.depositId);
      if (!deposit) throw new TRPCError({ code: "NOT_FOUND" });
      if (deposit.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该申请已处理" });

      await updateDeposit(input.depositId, {
        status: input.approved ? "approved" : "rejected",
        reviewedBy: ctx.user.id,
        reviewNote: input.reviewNote,
        reviewedAt: new Date(),
      });

      if (input.approved) {
        // Atomically credit balance
        const newBalanceStr = await adjustBalance(deposit.userId, parseFloat(deposit.amount));
        await addFundTransaction({
          userId: deposit.userId,
          type: "deposit",
          amount: deposit.amount,
          balanceAfter: newBalanceStr,
          relatedId: deposit.id,
          note: `充值审核通过`,
        });
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
      const withdrawal = await getWithdrawalById(input.withdrawalId);
      if (!withdrawal) throw new TRPCError({ code: "NOT_FOUND" });
      if (withdrawal.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该申请已处理" });

      if (input.approved) {
        // Mark as approved by admin, then attempt auto-payout
        await updateWithdrawal(input.withdrawalId, {
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
          // Keep status pending until payout succeeds
        });

        const netAmount = parseFloat(withdrawal.netAmount);
        const txHash = await attemptPayout(input.withdrawalId, withdrawal.toAddress!, netAmount);

        const user = await getUserById(withdrawal.userId);
        if (txHash) {
          // Auto-payout succeeded
          if (user) {
            await addFundTransaction({
              userId: withdrawal.userId,
              type: "withdrawal",
              amount: "0",
              balanceAfter: user.balance || "0",
              relatedId: withdrawal.id,
              note: `提现审核通过，自动打币 ${withdrawal.netAmount} USDT (TxHash: ${txHash})`,
            });
          }
          return { success: true, auto: true, txHash };
        } else {
          // Insufficient funds: leave pending, retry timer will handle it
          if (user) {
            await addFundTransaction({
              userId: withdrawal.userId,
              type: "withdrawal",
              amount: "0",
              balanceAfter: user.balance || "0",
              relatedId: withdrawal.id,
              note: `提现审核已通过，主钱包余额不足，等待打币`,
            });
          }
          return { success: true, auto: false, message: "审核已通过，主钱包余额不足，系统将在余额充足后自动打币" };
        }
      } else {
        // Fix: update withdrawal status FIRST, then refund balance
        await updateWithdrawal(input.withdrawalId, {
          status: "rejected",
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
        });
        // Atomically refund balance
        const refund = parseFloat(withdrawal.amount);
        const newBalanceStr = await adjustBalance(withdrawal.userId, refund);
        await addFundTransaction({
          userId: withdrawal.userId,
          type: "admin_adjust",
          amount: withdrawal.amount,
          balanceAfter: newBalanceStr,
          relatedId: withdrawal.id,
          note: `提现申请被拒绝，退款 ${withdrawal.amount} USDT`,
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
  adminResetAndImportWallet: adminProcedure
    .input(z.object({ mnemonic: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const result = await resetAndImportHDWallet(input.mnemonic);
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

  // Admin: liquidity pool management
  adminGetLiquidityPool: adminProcedure.query(async () => {
    const value = await getSystemConfig("liquidity_pool_balance");
    return { balance: parseFloat(value || "0") };
  }),

  adminAdjustLiquidityPool: adminProcedure
    .input(z.object({
      amount: z.number().refine((v) => v !== 0, { message: "调整金额不能为0" }),
      note: z.string().min(1, "请填写操作备注"),
    }))
    .mutation(async ({ input }) => {
      const currentStr = await getSystemConfig("liquidity_pool_balance");
      const current = parseFloat(currentStr || "0");
      const newBalance = current + input.amount;
      if (newBalance < 0) throw new TRPCError({ code: "BAD_REQUEST", message: `流动性池余额不足，当前 ${current.toFixed(2)} USDT，无法扣减 ${Math.abs(input.amount).toFixed(2)} USDT` });
      await setSystemConfig("liquidity_pool_balance", newBalance.toFixed(8));
      return { success: true, newBalance: newBalance.toFixed(8) };
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
      if (currentBalance + input.amount < 0) throw new TRPCError({ code: "BAD_REQUEST", message: `余额不足，当前余额 ${currentBalance.toFixed(2)} USDT，无法扣减 ${Math.abs(input.amount).toFixed(2)} USDT` });

      // Atomically adjust balance
      const newBalanceStr = await adjustBalance(input.userId, input.amount);
      await addFundTransaction({
        userId: input.userId,
        type: "admin_adjust",
        amount: input.amount.toFixed(8),
        balanceAfter: newBalanceStr,
        note: `管理员调整 [${ctx.user.id}]: ${input.note}`,
      });
      return { success: true, newBalance: newBalanceStr };
    }),
});
