import {
  addFundTransaction,
  createRevenueShareRecords,
  getUserById,
  getUserReferralChain,
  updateCopyOrder,
  adjustBalance,
  updateUser,
  getDirectReferralCount,
  disableAllUserStrategies,
  getSystemConfig,
  setSystemConfig,
  runInTransaction,
  getSmallZonePerformance,
} from "./db";

/**
 * Revenue Share Constants
 *
 * TOTAL_DEDUCTION_RATE: 40% of net profit is deducted from trader's platform balance.
 *   - REVENUE_POOL_RATE (20%): distributed to referral chain as rewards (treated as 100% of pool).
 *   - LIQUIDITY_POOL_RATE (20%): accumulated into the platform liquidity pool.
 *
 * VALID_USER_MIN_BALANCE: A user who has deposited >= 100 USDT (cumulative approved deposits) is considered a "valid user".
 * Valid user status ONLY affects whether an ancestor qualifies for the direct referral reward.
 *
 * Direct Referral Reward: based on number of valid direct referrals
 * Rank Reward (P1-P7): based on SMALL-ZONE umbrella performance (去大区取小区), differential (差额) model
 * Same-Rank Reward: 10% of pool, triggers when upstream has same P level as downstream, only once
 *
 * P-Level Qualification Rule (updated 2026-04-23):
 * A user's qualifying performance = sum of all direct branch performances MINUS the largest branch.
 * Branch performance = that direct referral's umbrellaPerformance (their entire subtree's exchange account balance sum).
 * umbrellaPerformance is now updated daily at 00:00 by reading each user's exchange API balance sum.
 * The old accumulation model (40% deductions) has been replaced by the daily balance snapshot model.
 */

const TOTAL_DEDUCTION_RATE = 0.40; // 40% of net profit total deduction
const REVENUE_POOL_RATE = 0.20;    // 20% → distributed to referral chain
const LIQUIDITY_POOL_RATE = 0.20;  // 20% → platform liquidity pool
const LIQUIDITY_POOL_CONFIG_KEY = "liquidity_pool_balance";
const VALID_USER_MIN_BALANCE = 100; // 100 USDT

// ─── Direct Referral Reward Tiers ──────────────────────────────────────────────
// Sorted descending so we can find the highest qualifying tier first
const DIRECT_REWARD_TIERS = [
  { minValidReferrals: 9, rate: 0.15 },
  { minValidReferrals: 6, rate: 0.10 },
  { minValidReferrals: 3, rate: 0.08 },
];

// ─── P-Level Rank Definitions ──────────────────────────────────────────────────
// Sorted descending by threshold for easy lookup
// minPerformance = small-zone performance threshold (去大区后小区业绩之和)
// Performance is now measured by the sum of all users' exchange account balances (updated daily at 00:00)
const RANK_LEVELS = [
  { level: 7, minPerformance: 3_000_000, rate: 0.55 },
  { level: 6, minPerformance: 1_000_000, rate: 0.45 },
  { level: 5, minPerformance: 300_000,   rate: 0.40 },
  { level: 4, minPerformance: 100_000,   rate: 0.35 },
  { level: 3, minPerformance: 30_000,    rate: 0.30 },
  { level: 2, minPerformance: 15_000,    rate: 0.20 },
  { level: 1, minPerformance: 5_000,     rate: 0.10 },
];

const SAME_RANK_RATE = 0.10; // 10% of pool for same-rank reward

// ─── Helper: determine P level from SMALL-ZONE performance ─────────────────────
// NOTE: smallZonePerformance = sum of all branch performances minus the largest branch
export function calcPLevel(smallZonePerformance: number): number {
  for (const rank of RANK_LEVELS) {
    if (smallZonePerformance >= rank.minPerformance) return rank.level;
  }
  return 0;
}

// ─── Helper: get rank reward rate for a given P level ──────────────────────────
function getRankRate(pLevel: number): number {
  const rank = RANK_LEVELS.find(r => r.level === pLevel);
  return rank ? rank.rate : 0;
}

// ─── Helper: get direct referral reward rate ───────────────────────────────────
function getDirectRewardRate(validDirectCount: number): number {
  for (const tier of DIRECT_REWARD_TIERS) {
    if (validDirectCount >= tier.minValidReferrals) return tier.rate;
  }
  return 0;
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Process revenue share for a closed profitable order.
 *
 * Mechanism:
 * 1. Deduct 40% of netPnl from trader's platform balance:
 *    - 20% (revenuePool) → distributed to referral chain
 *    - 20% (liquidityPool) → platform liquidity pool
 * 2. Direct Referral Reward: trader's direct parent gets X% of pool (if they have enough valid referrals)
 * 3. Rank Reward (differential): walk up the referral chain, each ancestor earns (own_rate - child_rate) of pool
 * 4. Same-Rank Reward: if an ancestor has the same P level as their direct child in the chain, they get 10% of pool (only once upward)
 * 5. Update umbrella performance for all ancestors (accumulate actualTotalDeduction = 40%)
 * 6. Recalculate P levels for all affected ancestors using small-zone performance (去大区取小区)
 */
export async function processRevenueShare(params: {
  copyOrderId: number;
  traderId: number;
  netPnl: number;
}): Promise<void> {
  const { copyOrderId, traderId, netPnl } = params;
  if (netPnl <= 0) return; // Only process profitable orders

  const trader = await getUserById(traderId);
  if (!trader) return;

  // ── Step 1: Calculate and deduct 40% from trader's platform balance ──
  // Total deduction = 40% of netPnl:
  //   - 20% (revenuePool) → distributed to referral chain
  //   - 20% (liquidityPool) → platform liquidity pool
  // If balance is insufficient, deduct only what's available (clamp to 0).
  // The actual deducted amount is split proportionally between the two pools.
  const theoreticalTotalDeduction = netPnl * TOTAL_DEDUCTION_RATE;
  if (theoreticalTotalDeduction <= 0) return;

  const traderBalance = parseFloat(trader.balance || "0");
  // Actual total deduction is capped at current balance (cannot go negative)
  const actualTotalDeduction = Math.min(theoreticalTotalDeduction, traderBalance);
  // Split proportionally: each half = actualTotalDeduction / 2
  const actualRevenuePool = actualTotalDeduction * (REVENUE_POOL_RATE / TOTAL_DEDUCTION_RATE);
  const actualLiquidityPool = actualTotalDeduction * (LIQUIDITY_POOL_RATE / TOTAL_DEDUCTION_RATE);
  // The revenue pool used for ALL downstream reward calculations
  const revenuePool = actualRevenuePool;
  const newTraderBalance = traderBalance - actualTotalDeduction; // always >= 0

  // ── Step 2: Get referral chain (parent, grandparent, ...) ──
  // Pre-fetch outside transaction to avoid long-held locks on read queries
  const chain = await getUserReferralChain(traderId);

  // Pre-fetch direct referral count for parent (read-only, outside transaction)
  const directParent = chain[0];
  let directRate = 0;
  if (directParent) {
    const validCount = await getDirectReferralCount(directParent.id, VALID_USER_MIN_BALANCE);
    directRate = getDirectRewardRate(validCount);
  }

  const records: Array<{
    copyOrderId: number;
    traderId: number;
    recipientId: number;
    level: number;
    rewardType: "direct" | "rank" | "same_rank";
    traderPnl: string;
    ratio: string;
    amount: string;
  }> = [];

  // Wrap all fund mutations in a single DB transaction
  await runInTransaction(async () => {
    // ── Step 1 (writes): Deduct from trader + write fund transaction + update order ──
    const newTraderBalanceStr = await adjustBalance(traderId, -actualTotalDeduction);
    await addFundTransaction({
      userId: traderId,
      type: "revenue_share_out",
      amount: (-actualTotalDeduction).toFixed(8),
      balanceAfter: newTraderBalanceStr,
      relatedId: copyOrderId,
      note: `收益分成扣减（盈利 ${netPnl.toFixed(4)} 的 40%，应扣 ${theoreticalTotalDeduction.toFixed(4)}，实扣 ${actualTotalDeduction.toFixed(4)}；其中分配奖励池 ${actualRevenuePool.toFixed(4)}，流动性池 ${actualLiquidityPool.toFixed(4)}）`,
    });
    await updateCopyOrder(copyOrderId, { revenueShareDeducted: actualTotalDeduction.toFixed(8) });

    // If actual deduction is 0 (balance was already 0 before), nothing to distribute
    if (revenuePool <= 0) return;

    if (chain.length === 0) {
      // No referrers — all pool goes to platform (umbrella update happens after tx)
      return;
    }

    // ── Step 3: Direct Referral Reward ──
    // Only the trader's DIRECT parent (chain[0]) can receive this
    if (directParent && directRate > 0) {
      const directAmount = revenuePool * directRate;
      records.push({
        copyOrderId,
        traderId,
        recipientId: directParent.id,
        level: 1,
        rewardType: "direct",
        traderPnl: netPnl.toFixed(8),
        ratio: (directRate * 100).toFixed(2),
        amount: directAmount.toFixed(8),
      });
      // Credit parent balance atomically
      const newParentBalanceStr = await adjustBalance(directParent.id, directAmount);
      await addFundTransaction({
        userId: directParent.id,
        type: "revenue_share_in",
        amount: directAmount.toFixed(8),
        balanceAfter: newParentBalanceStr,
        relatedId: copyOrderId,
        note: `直推奖：来自用户 #${traderId} 的收益分成`,
      });
      console.log(`[RevenueShare] 直推奖: user #${directParent.id} gets ${directAmount.toFixed(4)} (${(directRate * 100).toFixed(0)}% of pool ${revenuePool.toFixed(4)}), validReferrals=${Math.round(directRate / 0.01)}`);
    }

    // ── Step 4: Rank Reward (differential / 差额制) ──
    // Walk up the chain. Each ancestor earns (own_rank_rate - child_rank_rate) * pool
    // child_rank_rate starts at 0 (the trader has no rank reward rate, they are the source)
    // NOTE: P level used here is the CURRENT stored pLevel (already calculated from small-zone performance)
    let childRankRate = 0;

    for (let i = 0; i < chain.length; i++) {
      const ancestor = chain[i];
      const ancestorUser = await getUserById(ancestor.id);
      if (!ancestorUser) continue;

      const ancestorPLevel = ancestor.pLevel ?? 0;
      const ancestorRankRate = getRankRate(ancestorPLevel);

      const diff = ancestorRankRate - childRankRate;
      if (diff > 0) {
        const rankAmount = revenuePool * diff;
        records.push({
          copyOrderId,
          traderId,
          recipientId: ancestor.id,
          level: i + 1,
          rewardType: "rank",
          traderPnl: netPnl.toFixed(8),
          ratio: (diff * 100).toFixed(2),
          amount: rankAmount.toFixed(8),
        });
        // Credit ancestor balance atomically
        const newAncestorBalanceStr = await adjustBalance(ancestor.id, rankAmount);
        await addFundTransaction({
          userId: ancestor.id,
          type: "revenue_share_in",
          amount: rankAmount.toFixed(8),
          balanceAfter: newAncestorBalanceStr,
          relatedId: copyOrderId,
          note: `级别奖（P${ancestorPLevel}）：来自用户 #${traderId} 的收益分成`,
        });
        console.log(`[RevenueShare] 级别奖: user #${ancestor.id} (P${ancestorPLevel}) gets ${rankAmount.toFixed(4)} (diff ${(diff * 100).toFixed(0)}% of pool)`);
      }

      // Update childRankRate for next level up
      childRankRate = Math.max(childRankRate, ancestorRankRate);

      // If we've reached the max possible rate (P7 = 55%), no further ancestors can earn rank reward
      if (childRankRate >= 0.55) break;
    }

    // ── Step 5: Same-Rank Reward (平级奖) ──
    // Walk up the chain. When an ancestor has the same P level as their direct child in the chain,
    // the ancestor gets 10% of pool. Only triggers ONCE upward (只平一级).
    let sameRankAwarded = false;
    for (let i = 0; i < chain.length && !sameRankAwarded; i++) {
      const ancestor = chain[i];
      const ancestorPLevel = ancestor.pLevel ?? 0;
      if (ancestorPLevel === 0) continue; // No level, skip

      // The "child" in the chain for this ancestor
      let childPLevel: number;
      if (i === 0) {
        // The child is the trader — trader has no P level in this context
        continue;
      } else {
        childPLevel = chain[i - 1].pLevel ?? 0;
      }

      if (ancestorPLevel > 0 && ancestorPLevel === childPLevel) {
        const sameRankAmount = revenuePool * SAME_RANK_RATE;
        records.push({
          copyOrderId,
          traderId,
          recipientId: ancestor.id,
          level: i + 1,
          rewardType: "same_rank",
          traderPnl: netPnl.toFixed(8),
          ratio: (SAME_RANK_RATE * 100).toFixed(2),
          amount: sameRankAmount.toFixed(8),
        });
        // Credit ancestor balance atomically
        const newSameRankBalanceStr = await adjustBalance(ancestor.id, sameRankAmount);
        await addFundTransaction({
          userId: ancestor.id,
          type: "revenue_share_in",
          amount: sameRankAmount.toFixed(8),
          balanceAfter: newSameRankBalanceStr,
          relatedId: copyOrderId,
          note: `平级奖（P${ancestorPLevel}）：来自用户 #${traderId} 的收益分成`,
        });
        console.log(`[RevenueShare] 平级奖: user #${ancestor.id} (P${ancestorPLevel}) gets ${sameRankAmount.toFixed(4)} (10% of pool)`);
        sameRankAwarded = true; // Only award once
      }
    }

    // ── Step 6: Save all records ──
    if (records.length > 0) {
      await createRevenueShareRecords(records as any);
    }
  }); // end runInTransaction — commits here, or rolls back on any error above

  // ── Post-transaction: non-fund side effects ──

  // Accumulate liquidity pool
  if (actualLiquidityPool > 0) {
    const currentPoolStr = await getSystemConfig(LIQUIDITY_POOL_CONFIG_KEY);
    const currentPool = parseFloat(currentPoolStr || "0");
    const newPool = currentPool + actualLiquidityPool;
    await setSystemConfig(LIQUIDITY_POOL_CONFIG_KEY, newPool.toFixed(8));
  }

  // If balance has reached 0, automatically pause all strategies for this user
  if (newTraderBalance <= 0) {
    console.log(`[RevenueShare] ⚠️ User #${traderId} balance reached 0 after deduction. Pausing all strategies.`);
    await disableAllUserStrategies(traderId);
  }

  // ── Step 7: Update umbrella performance for all ancestors ──
  // Accumulate actualTotalDeduction (40%) — NOT just revenuePool (20%).
  // Then recalculate P levels using small-zone performance (去大区取小区).
  if (actualTotalDeduction > 0) {
    await updateUmbrellaPerformance(traderId, actualTotalDeduction, chain);
  }
}

/**
 * [DEPRECATED - No longer called on order close]
 * P-level and umbrellaPerformance are now updated daily at 00:00 via the daily balance snapshot job.
 * This function is kept for reference only.
 *
 * Previously: accumulated 40% deduction on each close into umbrellaPerformance.
 * Now: umbrellaPerformance = sum of exchange account balances of all users in subtree (daily snapshot).
 */
async function updateUmbrellaPerformance(
  _traderId: number,
  _actualTotalDeduction: number,
  _preloadedChain?: Array<{ id: number; pLevel: number; revenueShareRatio: string }>
): Promise<void> {
  // No-op: umbrella performance is now updated by the daily balance snapshot job (00:00 UTC+8)
  // See: startDailyPerformanceUpdate() in index.ts
}
