/**
 * Daily Performance Update Job
 *
 * Runs every day at 00:00 (Asia/Shanghai, UTC+8).
 *
 * What it does:
 * 1. For every active user with at least one active exchange API:
 *    - Reads the USDT balance from each bound exchange account
 *    - Sums all balances as the user's "performance" (umbrellaPerformance)
 * 2. Propagates each user's balance upward through the referral chain,
 *    accumulating subtree totals into each ancestor's umbrellaPerformance.
 * 3. Recalculates each ancestor's P-level using small-zone performance
 *    (total subtree performance minus the largest direct branch).
 *
 * This replaces the old model where umbrellaPerformance was accumulated
 * from 40% deductions on each trade close.
 */

import {
  getUsersWithActiveExchangeApis,
  getUserExchangeBalanceSum,
  getUserById,
  updateUser,
  getSmallZonePerformance,
} from "./db";
import { decrypt } from "./crypto";
import { getBinanceBalance } from "./binance-client";
import { getBalance as getOkxBalance } from "./okx-client";
import { getBybitBalance } from "./bybit-client";
import { getBitgetBalance } from "./bitget-client";
import { getGateBalance } from "./gate-client";

// P-level thresholds (must match revenue-share.ts RANK_LEVELS)
const RANK_LEVELS = [
  { level: 7, minPerformance: 3_000_000 },
  { level: 6, minPerformance: 1_000_000 },
  { level: 5, minPerformance: 300_000 },
  { level: 4, minPerformance: 100_000 },
  { level: 3, minPerformance: 30_000 },
  { level: 2, minPerformance: 15_000 },
  { level: 1, minPerformance: 5_000 },
];

function calcPLevel(smallZonePerf: number): number {
  for (const rank of RANK_LEVELS) {
    if (smallZonePerf >= rank.minPerformance) return rank.level;
  }
  return 0;
}

const exchangeClients = {
  getBinanceBalance: (creds: { apiKey: string; secretKey: string }) =>
    getBinanceBalance(creds),
  getOkxBalance: (creds: { apiKey: string; secretKey: string; passphrase: string }) =>
    getOkxBalance(creds),
  getBybitBalance: (creds: { apiKey: string; secretKey: string }) =>
    getBybitBalance(creds),
  getBitgetBalance: (creds: { apiKey: string; secretKey: string; passphrase: string }) =>
    getBitgetBalance(creds),
  getGateBalance: (creds: { apiKey: string; secretKey: string }) =>
    getGateBalance(creds),
};

/**
 * Run the daily performance update.
 * Called at 00:00 UTC+8 every day.
 */
export async function runDailyPerformanceUpdate(): Promise<void> {
  const startTime = Date.now();
  console.log("[DailyPerf] Starting daily performance update...");

  try {
    // Step 1: Get all active users with exchange APIs
    const usersWithApis = await getUsersWithActiveExchangeApis();
    console.log(`[DailyPerf] Found ${usersWithApis.length} users with active exchange APIs`);

    // Step 2: For each user, read exchange balance sum and store as their own umbrellaPerformance
    // We store the user's OWN balance as their leaf-level performance.
    // Ancestor accumulation happens in step 3.
    const userBalanceMap = new Map<number, number>(); // userId -> balance sum

    for (const u of usersWithApis) {
      try {
        const balance = await getUserExchangeBalanceSum(u.id, decrypt, exchangeClients);
        userBalanceMap.set(u.id, balance);
      } catch (e: any) {
        console.warn(`[DailyPerf] Failed to get balance for user #${u.id}: ${e.message}`);
        userBalanceMap.set(u.id, 0);
      }
    }

    // Step 3: Reset umbrellaPerformance for ALL users to 0 first,
    // then accumulate from leaf to root using BFS upward.
    // We use a simple approach: for each user, walk up the referral chain
    // and add their balance to each ancestor's umbrellaPerformance.

    // First, reset all users' umbrellaPerformance to 0
    // (only users who have exchange APIs — others stay as-is)
    const allUserIds = new Set(usersWithApis.map((u) => u.id));

    // Build a map of userId -> referrerId for fast lookup
    const referrerMap = new Map<number, number | null>();
    for (const u of usersWithApis) {
      referrerMap.set(u.id, u.referrerId);
    }

    // Collect all ancestor IDs we need to update
    const ancestorPerformance = new Map<number, number>(); // ancestorId -> accumulated balance

    for (const [userId, balance] of userBalanceMap.entries()) {
      if (balance <= 0) continue;
      // Walk up the referral chain
      let currentId: number | null = referrerMap.get(userId) ?? null;
      // Also need to fetch referrerId for ancestors not in usersWithApis
      const visited = new Set<number>();
      while (currentId !== null && !visited.has(currentId)) {
        visited.add(currentId);
        const prev = ancestorPerformance.get(currentId) || 0;
        ancestorPerformance.set(currentId, prev + balance);
        // Get next ancestor
        if (referrerMap.has(currentId)) {
          currentId = referrerMap.get(currentId) ?? null;
        } else {
          // Fetch from DB if not in our map
          const ancestor = await getUserById(currentId);
          if (!ancestor) break;
          referrerMap.set(currentId, ancestor.referrerId ?? null);
          currentId = ancestor.referrerId ?? null;
        }
      }
    }

    // Step 4: Write umbrellaPerformance for all affected users
    // For leaf users (those with exchange APIs), set their own balance
    for (const [userId, balance] of userBalanceMap.entries()) {
      const ancestorContrib = ancestorPerformance.get(userId) || 0;
      // umbrellaPerformance = own balance + all subtree balances flowing through this node
      // Since we already accumulated subtree in ancestorPerformance, we need to add own balance too
      const totalPerf = balance + ancestorContrib;
      await updateUser(userId, { umbrellaPerformance: totalPerf.toFixed(8) });
    }

    // For ancestor-only users (not in usersWithApis but have subtree contributions)
    for (const [ancestorId, perf] of ancestorPerformance.entries()) {
      if (!allUserIds.has(ancestorId)) {
        await updateUser(ancestorId, { umbrellaPerformance: perf.toFixed(8) });
      }
    }

    console.log(`[DailyPerf] Updated umbrellaPerformance for ${userBalanceMap.size + ancestorPerformance.size} users`);

    // Step 5: Recalculate P-level for all affected ancestors
    const allAffectedIds = new Set([...userBalanceMap.keys(), ...ancestorPerformance.keys()]);
    let pLevelUpdates = 0;

    for (const userId of allAffectedIds) {
      try {
        const user = await getUserById(userId);
        if (!user) continue;
        const smallZonePerf = await getSmallZonePerformance(userId);
        const newPLevel = calcPLevel(smallZonePerf);
        if (newPLevel !== (user.pLevel ?? 0)) {
          await updateUser(userId, { pLevel: newPLevel });
          console.log(`[DailyPerf] 🎖️ User #${userId} P-level: ${user.pLevel ?? 0} → P${newPLevel} (smallZone: ${smallZonePerf.toFixed(2)})`);
          pLevelUpdates++;
        }
      } catch (e: any) {
        console.warn(`[DailyPerf] Failed to update P-level for user #${userId}: ${e.message}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DailyPerf] Done. ${pLevelUpdates} P-level changes. Took ${elapsed}s`);
  } catch (e: any) {
    console.error("[DailyPerf] Fatal error:", e.message);
  }
}

/**
 * Schedule the daily performance update to run at 00:00 UTC+8 (16:00 UTC).
 * Uses a simple timer that calculates ms until next midnight UTC+8.
 */
export function startDailyPerformanceUpdate(): void {
  const scheduleNext = () => {
    const now = new Date();
    // Calculate next 00:00 UTC+8 = 16:00 UTC previous day
    const nextMidnightUTC8 = new Date();
    nextMidnightUTC8.setUTCHours(16, 0, 0, 0); // 16:00 UTC = 00:00 UTC+8
    if (nextMidnightUTC8 <= now) {
      // Already past today's 00:00 UTC+8, schedule for tomorrow
      nextMidnightUTC8.setUTCDate(nextMidnightUTC8.getUTCDate() + 1);
    }
    const msUntilNext = nextMidnightUTC8.getTime() - now.getTime();
    const hoursUntil = (msUntilNext / 3600000).toFixed(1);
    console.log(`[DailyPerf] Next performance update scheduled in ${hoursUntil}h (at ${nextMidnightUTC8.toISOString()})`);

    setTimeout(async () => {
      await runDailyPerformanceUpdate();
      // Schedule the next run (24h later)
      scheduleNext();
    }, msUntilNext);
  };

  scheduleNext();
}
