/**
 * PnL Recovery Module
 *
 * Automatically scans for closed orders with NULL PnL data and attempts to
 * backfill them from exchange APIs. After backfilling, triggers revenue share
 * processing for profitable orders.
 *
 * This runs:
 * 1. Once at server startup (to recover from any interrupted processing)
 * 2. Every 10 minutes via setInterval (to catch any future interruptions)
 */

import { getDb } from "./db";
import { copyOrders, exchangeApis } from "../drizzle/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import { decrypt } from "./crypto";
import { getBinanceOrderDetail, toBinanceSymbol } from "./binance-client";
import { getBybitOrderDetail, getBybitClosedPnl, toBybitSymbol } from "./bybit-client";
import { getBitgetOrderDetail, toBitgetSymbol } from "./bitget-client";
import { getGateOrderDetail } from "./gate-client";
import { getOkxOrderDetail } from "./okx-client";
import { processRevenueShare } from "./revenue-share";

const RECOVERY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Scan and recover all closed orders with NULL PnL data.
 * For each order: fetch PnL from exchange, update DB, then run revenue share.
 */
export async function recoverNullPnlOrders(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Find all closed orders with NULL closePrice (PnL not yet filled)
    // OR profitable orders that haven't had revenue share deducted yet
    const nullOrders = await db
      .select({
        id: copyOrders.id,
        userId: copyOrders.userId,
        exchange: copyOrders.exchange,
        symbol: copyOrders.symbol,
        exchangeApiId: copyOrders.exchangeApiId,
        closeOrderId: copyOrders.closeOrderId,
        exchangeOrderId: copyOrders.exchangeOrderId,
        revenueShareDeducted: copyOrders.revenueShareDeducted,
        netPnl: copyOrders.netPnl,
        closePrice: copyOrders.closePrice,
      })
      .from(copyOrders)
      .where(
        and(
          eq(copyOrders.status, "closed"),
          sql`(closePrice IS NULL OR (netPnl > 0 AND (revenueShareDeducted IS NULL OR revenueShareDeducted <= 0)))`
        )
      );

    if (nullOrders.length === 0) return;

    console.log(`[PnlRecovery] Found ${nullOrders.length} closed orders with NULL PnL, starting recovery...`);

    let recovered = 0;
    let failed = 0;

    for (const order of nullOrders) {
      try {
        // Get exchange API credentials
        const apiRows = await db
          .select()
          .from(exchangeApis)
          .where(eq(exchangeApis.id, order.exchangeApiId));

        if (!apiRows.length) {
          console.warn(`[PnlRecovery] Order ${order.id}: no exchange API found (id=${order.exchangeApiId})`);
          continue;
        }

        const api = apiRows[0];
        const orderId = order.closeOrderId || order.exchangeOrderId;

        if (!orderId) {
          console.warn(`[PnlRecovery] Order ${order.id}: no exchangeOrderId, skipping`);
          continue;
        }

        // If closePrice is already set, we just need to process revenue share (skip exchange API call)
        if (order.closePrice !== null) {
          const existingNetPnl = parseFloat(order.netPnl || "0");
          if (existingNetPnl > 0) {
            const latestOrder = await db.select({ revenueShareDeducted: copyOrders.revenueShareDeducted }).from(copyOrders).where(eq(copyOrders.id, order.id)).limit(1);
            const alreadyDeducted = parseFloat(latestOrder[0]?.revenueShareDeducted || "0");
            if (alreadyDeducted <= 0) {
              try {
                await processRevenueShare({
                  copyOrderId: order.id,
                  traderId: order.userId,
                  netPnl: existingNetPnl,
                });
                console.log(`[PnlRecovery] ✅ Revenue share processed for existing order ${order.id} (netPnl=${existingNetPnl.toFixed(4)})`);
                recovered++;
              } catch (rsErr) {
                console.error(`[PnlRecovery] ⚠️ Revenue share failed for existing order ${order.id}:`, rsErr instanceof Error ? rsErr.message : rsErr);
                failed++;
              }
            }
          }
          continue;
        }

        let closePrice = 0;
        let fee = 0;
        let realizedPnl = 0;

        if (order.exchange === "binance") {
          const symbol = toBinanceSymbol(order.symbol);
          const detail = await getBinanceOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, orderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.commission) || 0);
          realizedPnl = parseFloat(detail.realizedPnl) || 0;
        } else if (order.exchange === "bybit") {
          const symbol = toBybitSymbol(order.symbol);
          const detail = await getBybitOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, orderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.cumExecFee) || 0);
          realizedPnl = await getBybitClosedPnl(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, orderId
          );
        } else if (order.exchange === "bitget") {
          const symbol = toBitgetSymbol(order.symbol);
          const detail = await getBitgetOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
            symbol, orderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.profit) || 0;
        } else if (order.exchange === "gate") {
          const detail = await getGateOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            orderId
          );
          closePrice = parseFloat(detail.fillPrice) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.pnl) || 0;
        } else {
          // OKX
          const detail = await getOkxOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
            order.symbol, orderId
          );
          closePrice = parseFloat(detail.avgPx) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.pnl) || 0;
        }

        if (closePrice === 0) {
          console.warn(`[PnlRecovery] Order ${order.id}: closePrice=0 from exchange, skipping`);
          continue;
        }

        const netPnl = realizedPnl - fee;

        // Update order with PnL data
        await db.update(copyOrders)
          .set({
            closePrice: closePrice.toFixed(8),
            realizedPnl: realizedPnl.toFixed(8),
            fee: fee.toFixed(8),
            netPnl: netPnl.toFixed(8),
          })
          .where(eq(copyOrders.id, order.id));

        console.log(`[PnlRecovery] ✅ Order ${order.id} (user ${order.userId}): closePrice=${closePrice.toFixed(4)}, realizedPnl=${realizedPnl.toFixed(4)}, netPnl=${netPnl.toFixed(4)}`);

        // Process revenue share if profitable and not already deducted
        if (netPnl > 0) {
          // Re-fetch the order to get the absolute latest revenueShareDeducted
          // This prevents double-deduction if copy-engine just processed it
          const latestOrder = await db.select({ revenueShareDeducted: copyOrders.revenueShareDeducted }).from(copyOrders).where(eq(copyOrders.id, order.id)).limit(1);
          const alreadyDeducted = parseFloat(latestOrder[0]?.revenueShareDeducted || "0");
          if (alreadyDeducted <= 0) {
            try {
              await processRevenueShare({
                copyOrderId: order.id,
                traderId: order.userId,
                netPnl: netPnl,
              });
              console.log(`[PnlRecovery] ✅ Revenue share processed for order ${order.id}`);
            } catch (rsErr) {
              console.error(`[PnlRecovery] ⚠️ Revenue share failed for order ${order.id}:`, rsErr instanceof Error ? rsErr.message : rsErr);
            }
          }
        }

        recovered++;
      } catch (err) {
        console.error(`[PnlRecovery] ❌ Order ${order.id} recovery failed:`, err instanceof Error ? err.message : err);
        failed++;
      }
    }

    if (recovered > 0 || failed > 0) {
      console.log(`[PnlRecovery] Done: ${recovered} recovered, ${failed} failed`);
    }

  } catch (err) {
    console.error("[PnlRecovery] Unexpected error:", err instanceof Error ? err.message : err);
  }
}

/**
 * Start the PnL recovery scheduler.
 * Runs once at startup (after 30s delay), then every 10 minutes.
 */
export function startPnlRecovery(): void {
  // Run once at startup (with a short delay to let the engine initialize)
  setTimeout(() => {
    recoverNullPnlOrders().catch(err =>
      console.error("[PnlRecovery] Startup recovery failed:", err instanceof Error ? err.message : err)
    );
  }, 30_000); // 30 seconds after startup

  // Then run every 10 minutes
  setInterval(() => {
    recoverNullPnlOrders().catch(err =>
      console.error("[PnlRecovery] Scheduled recovery failed:", err instanceof Error ? err.message : err)
    );
  }, RECOVERY_INTERVAL_MS);

  console.log("[PnlRecovery] Scheduler started (startup delay: 30s, interval: 10min)");
}
