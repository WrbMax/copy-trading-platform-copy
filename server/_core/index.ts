import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startAutoScan, sendUsdtFromMaster } from "../bsc-wallet";
import { startCopyEngine } from "../copy-engine";
import { startDailyPerformanceUpdate } from "../daily-performance-update";
import { startPnlRecovery } from "../pnl-recovery";
import { listWithdrawals, updateWithdrawal, addFundTransaction, getUserById, getSystemConfig, claimWithdrawalForProcessing } from "../db";

// ─── Withdrawal Retry Timer ───────────────────────────────────────────────────────

const WITHDRAWAL_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Scan all pending withdrawals that have been reviewed (reviewedAt set)
 * and attempt auto-payout. Skips if main wallet is insufficient.
 */
async function retryPendingWithdrawals(): Promise<void> {
  try {
    const { items } = await listWithdrawals(undefined, 1, 100, { status: "pending" });
    if (!items || items.length === 0) return;

    // Only process withdrawals that have been approved (reviewedAt set) or are small auto-approve ones
    const autoThreshold = parseFloat(
      (await getSystemConfig("withdrawal_auto_approve_threshold")) ?? "200"
    );

    for (const w of items) {
      const amount = parseFloat(w.amount);
      const netAmount = parseFloat(w.netAmount ?? w.amount);
      const toAddress = w.address; // listWithdrawals maps toAddress -> address

      // Process if: auto-approve threshold (small) OR already reviewed/approved by admin
      const isAutoApprove = amount <= autoThreshold;
      const isAdminApproved = !!w.reviewedAt;
      if (!isAutoApprove && !isAdminApproved) continue;

      try {
        // ── Atomic claim: prevent duplicate payout with concurrent admin review ─────────────
        const claimed = await claimWithdrawalForProcessing(w.id);
        if (!claimed) {
          // Another process already claimed this withdrawal (e.g., admin just approved it)
          console.log(`[WithdrawalRetry] Withdrawal #${w.id} already claimed, skipping.`);
          continue;
        }

        let txHash: string;
        try {
          txHash = await sendUsdtFromMaster(toAddress, netAmount);
        } catch (payErr: any) {
          const msg: string = payErr.message || "";
          // Revert to pending so next cycle can retry
          await updateWithdrawal(w.id, { status: "pending" });
          if (msg.includes("不足") || msg.includes("insufficient") || msg.includes("Insufficient")) {
            // Main wallet still insufficient: stop entire cycle
            console.warn(`[WithdrawalRetry] Main wallet still insufficient, stopping retry cycle.`);
            break;
          }
          console.error(`[WithdrawalRetry] Failed to pay withdrawal #${w.id}:`, msg);
          continue;
        }

        await updateWithdrawal(w.id, {
          status: "completed",
          txHash,
          reviewedAt: w.reviewedAt ?? new Date(),
        });
        const user = await getUserById(w.userId);
        await addFundTransaction({
          userId: w.userId,
          type: "withdrawal",
          amount: "0",
          balanceAfter: user?.balance || "0",
          relatedId: w.id,
          note: `自动重试打币成功 ${netAmount} USDT (TxHash: ${txHash})`,
        });
        console.log(`[WithdrawalRetry] Paid withdrawal #${w.id}: ${netAmount} USDT -> ${toAddress}`);
      } catch (err: any) {
        console.error(`[WithdrawalRetry] Unexpected error for withdrawal #${w.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[WithdrawalRetry] Scan error:", err.message);
  }
}

function startWithdrawalRetryTimer(): void {
  // First run after 60 seconds (let server fully initialize)
  setTimeout(() => {
    retryPendingWithdrawals();
    setInterval(retryPendingWithdrawals, WITHDRAWAL_RETRY_INTERVAL);
  }, 60000);
  console.log(`[WithdrawalRetry] Timer started, retrying every ${WITHDRAWAL_RETRY_INTERVAL / 1000}s`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

/**
 * Kill any stray process occupying the target port,
 * excluding the current process itself to avoid self-termination.
 * Then wait up to 3 seconds for the OS to reclaim it.
 */
async function killPortOccupant(port: number): Promise<void> {
  const { exec } = await import("child_process");
  const selfPid = process.pid;
  // Use fuser to find PIDs occupying the port, then kill only those that are NOT self
  await new Promise<void>((resolve) => {
    exec(`fuser ${port}/tcp 2>/dev/null`, (err, stdout) => {
      const pids = stdout.trim().split(/\s+/).filter(p => p && p !== String(selfPid));
      if (pids.length === 0) { resolve(); return; }
      exec(`kill -9 ${pids.join(' ')} 2>/dev/null || true`, () => resolve());
    });
  });
  // Wait up to 3 seconds for port to be released
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (await isPortAvailable(port)) return;
  }
}

/**
 * Ensure the preferred port is available.
 * If occupied, kill the occupant and retry once.
 * Throws if the port is still busy after the kill attempt,
 * so PM2 will restart the process instead of silently using a wrong port.
 */
async function ensurePort(preferredPort: number): Promise<number> {
  if (await isPortAvailable(preferredPort)) return preferredPort;
  console.warn(`[Server] Port ${preferredPort} is occupied by a stray process — killing it...`);
  await killPortOccupant(preferredPort);
  if (await isPortAvailable(preferredPort)) {
    console.log(`[Server] Port ${preferredPort} reclaimed successfully.`);
    return preferredPort;
  }
  throw new Error(`[Server] Port ${preferredPort} is still occupied after kill attempt. Aborting so PM2 can restart.`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await ensurePort(preferredPort);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start automatic BSC deposit scanning
    startAutoScan();
    // Start copy trading engine (OKX WebSocket)
    startCopyEngine().catch((err: Error) => console.error("[CopyEngine] Failed to start:", err.message));
    // Start withdrawal auto-payout retry timer
    startWithdrawalRetryTimer();
    // Start daily performance update (runs at 00:00 UTC+8 every day)
    startDailyPerformanceUpdate();
    // Start PnL recovery scheduler (runs at startup + every 10 minutes)
    startPnlRecovery();
  });
}

startServer().catch(console.error);
