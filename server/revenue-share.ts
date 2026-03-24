import {
  addFundTransaction,
  createRevenueShareRecords,
  getAdminUser,
  getUserById,
  getUserReferralChain,
  updateCopyOrder,
  updateUser,
} from "./db";

/**
 * Process revenue share for a closed profitable order.
 * Uses differential (差额) multi-level sharing.
 *
 * The trader's revenueShareRatio determines how much of their profit is deducted.
 * Each ancestor in the referral chain earns the DIFFERENCE between the ratio
 * they set for their referral (i.e., the child's ratio) and their own ratio.
 *
 * Example:
 *   A (admin, ratio=10%) → B (referrer, ratio=10%) → C (trader, ratio=30%)
 *   C's profit = 100U
 *   → C deducted: 100 × 30% = 30U (C's own ratio)
 *   → B receives: 100 × (30% - 10%) = 20U (C's ratio minus B's ratio)
 *   → A receives: 100 × (10% - 0%) = 10U (B's ratio minus A's ratio or 0 if top)
 *
 * The chain from getUserReferralChain(C) returns [B, A] where each has their OWN ratio.
 * We compute: for each ancestor, their earning = (childRatio - ownRatio) * profit
 * where childRatio starts as the trader's ratio, then becomes the current ancestor's ratio
 * for the next level up.
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

  const traderRatio = parseFloat(trader.revenueShareRatio || "0");
  if (traderRatio <= 0) return; // No revenue share configured

  const totalDeducted = netPnl * (traderRatio / 100);
  if (totalDeducted <= 0) return;

  // Get the referral chain (parent, grandparent, ...)
  // chain[0] = direct parent (B), chain[1] = grandparent (A), etc.
  let chain = await getUserReferralChain(traderId);
  if (chain.length === 0) {
    const admin = await getAdminUser();
    if (!admin || admin.id === traderId) {
      // No referrer and no admin (or admin is trader) — deduct as platform income
      const updatedTrader = await getUserById(traderId);
      if (updatedTrader) {
        const newBalance = Math.max(0, parseFloat(updatedTrader.balance || "0") - totalDeducted);
        await updateUser(traderId, { balance: newBalance.toFixed(8) });
        await addFundTransaction({
          userId: traderId,
          type: "revenue_share_out",
          amount: (-totalDeducted).toFixed(8),
          balanceAfter: newBalance.toFixed(8),
          relatedId: copyOrderId,
          note: `收益分成扣减（归平台）`,
        });
        await updateCopyOrder(copyOrderId, { revenueShareDeducted: totalDeducted.toFixed(8) });
      }
      return;
    }
    chain = [{ id: admin.id, revenueShareRatio: admin.revenueShareRatio }];
  }

  const records: Array<{
    copyOrderId: number;
    traderId: number;
    recipientId: number;
    level: number;
    traderPnl: string;
    ratio: string;
    amount: string;
  }> = [];

  // Differential calculation:
  // childRatio starts as the trader's ratio (what the trader is charged).
  // For each ancestor, they earn (childRatio - ownRatio).
  // Then childRatio becomes ownRatio for the next level up.
  let childRatio = traderRatio;

  for (let i = 0; i < chain.length; i++) {
    const ancestor = chain[i];
    const ownRatio = parseFloat(ancestor.revenueShareRatio || "0");

    // This ancestor earns the difference between what their child is charged
    // and what they themselves would be charged by their parent
    const diff = childRatio - ownRatio;
    if (diff > 0) {
      const amount = netPnl * (diff / 100);
      if (amount > 0) {
        records.push({
          copyOrderId,
          traderId,
          recipientId: ancestor.id,
          level: i + 1,
          traderPnl: netPnl.toFixed(8),
          ratio: diff.toFixed(2),
          amount: amount.toFixed(8),
        });

        // Credit the ancestor's balance
        const recipient = await getUserById(ancestor.id);
        if (recipient) {
          const newBalance = parseFloat(recipient.balance || "0") + amount;
          await updateUser(ancestor.id, { balance: newBalance.toFixed(8) });
          await addFundTransaction({
            userId: ancestor.id,
            type: "revenue_share_in",
            amount: amount.toFixed(8),
            balanceAfter: newBalance.toFixed(8),
            relatedId: copyOrderId,
            note: `来自用户 #${traderId} 的收益分成`,
          });
        }
      }
    }

    // Move up: the next ancestor's "child ratio" is this ancestor's own ratio
    childRatio = ownRatio;

    // If own ratio is 0, no further ancestors can earn anything
    if (childRatio <= 0) break;
  }

  if (records.length > 0) {
    await createRevenueShareRecords(records as any);
  }

  // Deduct from trader's balance
  const updatedTrader = await getUserById(traderId);
  if (updatedTrader) {
    const newBalance = Math.max(0, parseFloat(updatedTrader.balance || "0") - totalDeducted);
    await updateUser(traderId, { balance: newBalance.toFixed(8) });
    await addFundTransaction({
      userId: traderId,
      type: "revenue_share_out",
      amount: (-totalDeducted).toFixed(8),
      balanceAfter: newBalance.toFixed(8),
      relatedId: copyOrderId,
      note: `收益分成扣减`,
    });
    await updateCopyOrder(copyOrderId, { revenueShareDeducted: totalDeducted.toFixed(8) });
  }
}
