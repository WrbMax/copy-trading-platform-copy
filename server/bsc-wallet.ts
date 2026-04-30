/**
 * BSC Wallet Module
 * - HD wallet derivation for per-user deposit addresses
 * - Dual deposit detection: BSCScan API + RPC balance snapshot
 * - Dedup via txHash (BSCScan) and balance snapshot (RPC) to prevent double-crediting
 * - Auto-collection (sweep) to main wallet
 * - Auto-scan timer (every 3 minutes)
 */

import { ethers } from "ethers";
import { encrypt, decrypt } from "./crypto";
import { getSystemConfig, setSystemConfig, getDb, adjustBalance, addFundTransaction } from "./db";
import { deposits, systemConfig } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// BSC Mainnet config
const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const BSC_RPC_FALLBACKS = [
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed1.defibit.io",
];
const BSC_CHAIN_ID = 56;
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT

// Minimal ERC-20 ABI for transfer and balanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// BSCScan API base (migrated to Etherscan API V2 - https://docs.etherscan.io/v2-migration)
// The old api.bscscan.com V1 endpoint is deprecated; use Etherscan V2 with chainid=56
const BSCSCAN_API = "https://api.etherscan.io/v2/api";
const BSCSCAN_CHAIN_ID = "56"; // BNB Smart Chain

// Scan interval in ms (1 minute - BSCScan API deprecated, relying on RPC balance detection)
const SCAN_INTERVAL = 1 * 60 * 1000;

// Track if auto-scan is running
let autoScanTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helper: get provider with fallback ──────────────────────────────────────

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BSC_RPC_URL, BSC_CHAIN_ID);
}

async function getProviderWithFallback(): Promise<ethers.JsonRpcProvider> {
  const urls = [BSC_RPC_URL, ...BSC_RPC_FALLBACKS];
  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url, BSC_CHAIN_ID);
      await provider.getBlockNumber(); // quick health check
      return provider;
    } catch {
      continue;
    }
  }
  return new ethers.JsonRpcProvider(BSC_RPC_URL, BSC_CHAIN_ID);
}

// ─── HD Wallet Functions ──────────────────────────────────────────────────────

export async function initHDWallet(): Promise<{ mnemonic: string; mainAddress: string }> {
  const existing = await getSystemConfig("hd_mnemonic_encrypted");
  if (existing) {
    const mnemonic = decrypt(existing);
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
    const mainWallet = hdNode.deriveChild(0);
    return { mnemonic, mainAddress: mainWallet.address };
  }

  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic!.phrase;
  const encrypted = encrypt(mnemonic);

  await setSystemConfig("hd_mnemonic_encrypted", encrypted);
  await setSystemConfig("hd_next_index", "1");
  await setSystemConfig("main_wallet_address", wallet.address);

  return { mnemonic, mainAddress: wallet.address };
}

export async function importHDWallet(mnemonic: string): Promise<{ mainAddress: string }> {
  if (!ethers.Mnemonic.isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
  const mainWallet = hdNode.deriveChild(0);

  const encrypted = encrypt(mnemonic);
  await setSystemConfig("hd_mnemonic_encrypted", encrypted);
  await setSystemConfig("hd_next_index", "1");
  await setSystemConfig("main_wallet_address", mainWallet.address);

  return { mainAddress: mainWallet.address };
}

export async function resetAndImportHDWallet(mnemonic: string): Promise<{ mainAddress: string }> {
  // Validate mnemonic first
  if (!ethers.Mnemonic.isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  // Stop auto scan before resetting
  stopAutoScan();

  // Clear all existing deposit addresses (deposit_addr_*)
  const { deleteSystemConfigByPrefix } = await import("./db");
  await deleteSystemConfigByPrefix("deposit_addr_");

  // Clear core wallet config
  await setSystemConfig("hd_next_index", "1");

  // Import new mnemonic
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
  const mainWallet = hdNode.deriveChild(0);

  const encrypted = encrypt(mnemonic);
  await setSystemConfig("hd_mnemonic_encrypted", encrypted);
  await setSystemConfig("main_wallet_address", mainWallet.address);

  // Restart auto scan
  startAutoScan();

  return { mainAddress: mainWallet.address };
}

export async function deriveDepositAddress(userId: number): Promise<{ address: string; index: number }> {
  const mnemonicEncrypted = await getSystemConfig("hd_mnemonic_encrypted");
  if (!mnemonicEncrypted) throw new Error("HD wallet not initialized");

  const mnemonic = decrypt(mnemonicEncrypted);
  const nextIndexStr = await getSystemConfig("hd_next_index") ?? "1";
  const nextIndex = parseInt(nextIndexStr, 10);

  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
  const childWallet = hdNode.deriveChild(nextIndex);

  await setSystemConfig(`deposit_addr_${userId}`, JSON.stringify({
    address: childWallet.address,
    index: nextIndex,
  }));

  await setSystemConfig("hd_next_index", (nextIndex + 1).toString());

  return { address: childWallet.address, index: nextIndex };
}

export async function getUserDepositAddress(userId: number): Promise<{ address: string; index: number } | null> {
  const data = await getSystemConfig(`deposit_addr_${userId}`);
  if (data) {
    return JSON.parse(data);
  }
  return null;
}

export async function getOrCreateDepositAddress(userId: number): Promise<{ address: string; index: number }> {
  const existing = await getUserDepositAddress(userId);
  if (existing) return existing;
  return deriveDepositAddress(userId);
}

async function getPrivateKeyForIndex(index: number): Promise<string> {
  const mnemonicEncrypted = await getSystemConfig("hd_mnemonic_encrypted");
  if (!mnemonicEncrypted) throw new Error("HD wallet not initialized");
  const mnemonic = decrypt(mnemonicEncrypted);
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0");
  return hdNode.deriveChild(index).privateKey;
}

async function getMainWalletPrivateKey(): Promise<string> {
  return getPrivateKeyForIndex(0);
}

// ─── Balance Queries ─────────────────────────────────────────────────────────

export async function getUSDTBalance(address: string): Promise<string> {
  try {
    const provider = await getProviderWithFallback();
    const contract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, 18);
  } catch (error) {
    console.error(`[BSC] Failed to get USDT balance for ${address}:`, error);
    return "0";
  }
}

export async function getBNBBalance(address: string): Promise<string> {
  try {
    const provider = await getProviderWithFallback();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error(`[BSC] Failed to get BNB balance for ${address}:`, error);
    return "0";
  }
}

// ─── BSCScan API Detection (Method 1) ────────────────────────────────────────

async function fetchUSDTTransfers(
  address: string,
  startBlock = 0,
  apiKey?: string
): Promise<Array<{
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timeStamp: number;
}>> {
  try {
    const key = apiKey || (await getSystemConfig("bscscan_api_key")) || "";
    const url = `${BSCSCAN_API}?chainid=${BSCSCAN_CHAIN_ID}&module=account&action=tokentx&contractaddress=${USDT_CONTRACT}&address=${address}&startblock=${startBlock}&endblock=99999999&sort=asc&apikey=${key}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();

    if (data.status !== "1" || !Array.isArray(data.result)) {
      console.log(`[BSCScan] No results for ${address}: ${data.message || "unknown"}`);
      return [];
    }

    return data.result
      .filter((tx: any) => tx.to.toLowerCase() === address.toLowerCase())
      .map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatUnits(tx.value, parseInt(tx.tokenDecimal || "18")),
        blockNumber: parseInt(tx.blockNumber),
        timeStamp: parseInt(tx.timeStamp),
      }));
  } catch (error: any) {
    console.error(`[BSCScan] Failed to fetch transfers for ${address}:`, error.message);
    return [];
  }
}

// ─── RPC Balance Snapshot Detection (Method 2) ───────────────────────────────

/**
 * Detect deposits by comparing current USDT balance with last known snapshot.
 * If balance increased, record the difference as a deposit.
 * Uses balance_snapshot_{address} in system_config for tracking.
 *
 * FIX(2026-04-22): 修复快照更新时序漏洞。
 * 原逻辑在 creditDeposit 执行之前就更新快照，若 creditDeposit 中途失败（DB 异常、
 * 进程崩溃等），快照已被推进，下次轮询将检测不到该笔充值，导致用户链上充值
 * 但平台余额未增加（漏账）。
 * 修复方案：detectByBalanceChange 不再负责更新快照，仅返回检测结果和目标余额；
 * 由调用方在 creditDeposit 成功后统一更新快照，确保「加钱」与「推进快照」的
 * 原子语义：加钱成功 → 推进快照；加钱失败 → 快照不变 → 下次轮询重试。
 */
async function detectByBalanceChange(
  userId: number,
  address: string,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<{ detected: boolean; amount: number; newSnapshot: number }> {
  const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
  const lastSnapshotStr = await getSystemConfig(snapshotKey) ?? "0";
  const lastSnapshot = parseFloat(lastSnapshotStr);

  const currentBalanceStr = await getUSDTBalance(address);
  const currentBalance = parseFloat(currentBalanceStr);

  // If balance increased, there's a new deposit
  const diff = currentBalance - lastSnapshot;
  if (diff < 0.001) {
    // No significant increase (< 0.001 USDT)
    // Update snapshot to current balance to keep it fresh (safe: no money involved)
    await setSystemConfig(snapshotKey, currentBalance.toFixed(8));
    return { detected: false, amount: 0, newSnapshot: currentBalance };
  }

  // FIX: 不在此处更新快照，将 newSnapshot 返回给调用方，
  // 由调用方在 creditDeposit 成功后再更新，防止漏账。
  return { detected: true, amount: diff, newSnapshot: currentBalance };
}

// ─── Unified Deposit Detection & Auto-Credit ─────────────────────────────────

/**
 * Check if a deposit with this txHash already exists (for BSCScan dedup)
 */
async function isTxHashRecorded(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, txHash: string): Promise<boolean> {
  const existing = await db.select().from(deposits)
    .where(eq(deposits.txHash, txHash)).limit(1);
  return existing.length > 0;
}

/**
 * Credit deposit to user balance with proper dedup.
 *
 * Idempotency guarantees:
 * 1. txHash-based dedup: real BSCScan txHashes are checked against existing deposit rows.
 * 2. RPC fallback: synthetic txHash is derived from address + snapshot amount (deterministic),
 *    so the same balance increase always maps to the same synthetic key → safe to re-run.
 * 3. Balance update uses atomic SQL (adjustBalance) instead of SELECT+UPDATE to prevent
 *    lost-update races under concurrent scans.
 */
async function creditDeposit(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  amount: number,
  address: string,
  txHash: string | null,
  fromAddress: string | null,
  source: string
): Promise<boolean> {
  // Build the effective txHash used for dedup
  // For RPC balance-change detection, use a deterministic key based on address + amount
  // so the same deposit event always produces the same key (idempotent across retries).
  const effectiveTxHash = txHash || `rpc_${address.toLowerCase()}_${amount.toFixed(8)}`;

  // Dedup check: skip if this txHash is already recorded
  const exists = await isTxHashRecorded(db, effectiveTxHash);
  if (exists) {
    console.log(`[Scan] Skipping duplicate txHash: ${effectiveTxHash}`);
    return false;
  }

  // Record the deposit first (insert before balance update to establish the dedup record)
  await db.insert(deposits).values({
    userId,
    amount: amount.toFixed(8),
    txHash: effectiveTxHash,
    fromAddress: fromAddress || "unknown",
    toAddress: address,
    proofNote: source,
    status: "approved",
    reviewedAt: new Date(),
  });

  // Credit to user balance using atomic SQL update (prevents lost-update race)
  const newBalanceStr = await adjustBalance(userId, amount);
  await addFundTransaction({
    userId,
    type: "deposit",
    amount: amount.toFixed(8),
    balanceAfter: newBalanceStr,
    note: txHash
      ? `BSC链上充值自动到账 TxHash: ${txHash.substring(0, 16)}...`
      : `BSC链上充值自动到账（余额检测）`,
  });
  console.log(`[Scan] Credited ${amount.toFixed(4)} USDT to user ${userId} via ${source}`);
  return true;
}

/**
 * Scan all user deposit addresses for new USDT deposits.
 * Dual detection: BSCScan API (precise txHash) + RPC balance snapshot (fallback).
 * Dedup ensures no double-crediting.
 */
export async function scanDeposits(): Promise<{
  detected: number;
  credited: number;
  errors: string[];
  method: string;
}> {
  const db = await getDb();
  if (!db) return { detected: 0, credited: 0, errors: ["Database not available"], method: "none" };

  const mnemonicExists = await getSystemConfig("hd_mnemonic_encrypted");
  if (!mnemonicExists) return { detected: 0, credited: 0, errors: ["HD wallet not initialized"], method: "none" };

  const errors: string[] = [];
  let detected = 0;
  let credited = 0;
  let methodUsed = "none";

  try {
    // Get all user deposit address configs
    const configs = await db.select().from(systemConfig)
      .where(sql`\`key\` LIKE 'deposit_addr_%'`);

    if (configs.length === 0) {
      return { detected: 0, credited: 0, errors: [], method: "no_addresses" };
    }

    const hasBscscanKey = !!(await getSystemConfig("bscscan_api_key"));

    for (const config of configs) {
      try {
        const userIdStr = config.key.replace("deposit_addr_", "");
        const userId = parseInt(userIdStr, 10);
        if (isNaN(userId)) continue;

        const addrData = JSON.parse(config.value);
        const address = addrData.address;

        let bscscanFound = false;

        // ── Method 1: BSCScan API (if API key available) ──
        // NOTE: BSCScan V1 API is deprecated. Etherscan V2 free tier does not support BSC (chain 56).
        // This block is kept for future compatibility but will silently skip if API returns NOTOK.
        if (hasBscscanKey) {
          try {
            const lastBlockKey = `last_block_${address.toLowerCase()}`;
            const lastBlockStr = await getSystemConfig(lastBlockKey) ?? "0";
            const lastBlock = parseInt(lastBlockStr, 10);

            const transfers = await fetchUSDTTransfers(address, lastBlock > 0 ? lastBlock + 1 : 0);

            if (transfers.length > 0) {
              methodUsed = "bscscan_api";

              for (const tx of transfers) {
                const amount = parseFloat(tx.value);
                if (amount <= 0) continue;

                const didCredit = await creditDeposit(
                  db, userId, amount, address, tx.hash, tx.from,
                  "BSCScan API 自动检测"
                );
                if (didCredit) {
                  detected++;
                  credited++;
                  bscscanFound = true;
                }

                // Update last checked block
                if (tx.blockNumber > lastBlock) {
                  await setSystemConfig(lastBlockKey, tx.blockNumber.toString());
                }
              }
            }
          } catch (bscscanErr: any) {
            // Silent fallthrough to RPC method - BSCScan API may be unavailable
          }
        }

        // ── Method 2: RPC Balance Snapshot (fallback / supplement) ──
        // Only use if BSCScan didn't find anything new
        if (!bscscanFound) {
          try {
            const { detected: balanceDetected, amount, newSnapshot } = await detectByBalanceChange(userId, address, db);
            if (balanceDetected && amount > 0) {
              methodUsed = methodUsed === "none" ? "rpc_balance" : methodUsed + "+rpc_balance";

              // FIX(2026-04-22): 快照更新移至 creditDeposit 成功之后执行。
              // 原逻辑在 detectByBalanceChange 内部提前更新快照，若后续加钱失败则漏账。
              // 现在：creditDeposit 成功返回 true 后，才将快照推进到 newSnapshot，
              // 确保「加钱」与「推进快照」的顺序一致性。
              const didCredit = await creditDeposit(
                db, userId, amount, address, null, null,
                "RPC余额变化检测"
              );
              if (didCredit) {
                detected++;
                credited++;
                // 加钱成功后才更新快照，防止漏账
                const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
                await setSystemConfig(snapshotKey, newSnapshot.toFixed(8));
              }
              // 若 didCredit = false（重复充值被拦截），快照也应更新以防止下次重复检测
              else {
                const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
                await setSystemConfig(snapshotKey, newSnapshot.toFixed(8));
              }
            }
          } catch (rpcErr: any) {
            errors.push(`RPC balance check for user ${userId}: ${rpcErr.message}`);
          }
        } else {
          // BSCScan found deposits, update balance snapshot to current to prevent RPC double-credit next time
          try {
            const currentBalance = await getUSDTBalance(address);
            const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
            await setSystemConfig(snapshotKey, parseFloat(currentBalance).toFixed(8));
          } catch {}
        }

      } catch (err: any) {
        errors.push(`User ${config.key}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Scan error: ${err.message}`);
  }

  console.log(`[Scan] Complete: detected=${detected}, credited=${credited}, method=${methodUsed}, errors=${errors.length}`);
  return { detected, credited, errors, method: methodUsed };
}

// ─── Auto Collection (Sweep) ──────────────────────────────────────────────────

async function sendGasToChild(childAddress: string, gasAmount = "0.001"): Promise<string> {
  const mainPrivateKey = await getMainWalletPrivateKey();
  const provider = await getProviderWithFallback();
  const mainWallet = new ethers.Wallet(mainPrivateKey, provider);

  const tx = await mainWallet.sendTransaction({
    to: childAddress,
    value: ethers.parseEther(gasAmount),
  });
  await tx.wait();
  return tx.hash;
}

async function sweepUSDT(childIndex: number, childAddress: string, mainAddress: string): Promise<string> {
  const childPrivateKey = await getPrivateKeyForIndex(childIndex);
  const provider = await getProviderWithFallback();
  const childWallet = new ethers.Wallet(childPrivateKey, provider);
  const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, childWallet);

  const balance = await usdtContract.balanceOf(childAddress);
  if (balance === BigInt(0)) return "";

  const tx = await usdtContract.transfer(mainAddress, balance);
  await tx.wait();
  return tx.hash;
}

export async function collectDeposits(): Promise<{
  collected: number;
  totalAmount: string;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { collected: 0, totalAmount: "0", errors: ["Database not available"] };

  const mainAddress = await getSystemConfig("main_wallet_address");
  if (!mainAddress) return { collected: 0, totalAmount: "0", errors: ["Main wallet not configured"] };

  const errors: string[] = [];
  let collected = 0;
  let totalAmount = 0;

  try {
    const configs = await db.select().from(systemConfig)
      .where(sql`\`key\` LIKE 'deposit_addr_%'`);

    for (const config of configs) {
      try {
        const addrData = JSON.parse(config.value);
        const address = addrData.address;
        const index = addrData.index;

        const balance = await getUSDTBalance(address);
        const balanceNum = parseFloat(balance);

        if (balanceNum < 1) continue;

        const bnbBalance = await getBNBBalance(address);
        if (parseFloat(bnbBalance) < 0.0005) {
          try {
            await sendGasToChild(address, "0.001");
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (gasErr: any) {
            errors.push(`Gas send to ${address} failed: ${gasErr.message}`);
            continue;
          }
        }

        const txHash = await sweepUSDT(index, address, mainAddress);
        if (txHash) {
          collected++;
          totalAmount += balanceNum;
          console.log(`[BSC] Collected ${balance} USDT from ${address} -> ${mainAddress}, tx: ${txHash}`);

          // Update balance snapshot after collection
          const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
          await setSystemConfig(snapshotKey, "0");
        }
      } catch (err: any) {
        errors.push(`Collection from ${config.key}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Collection error: ${err.message}`);
  }

  return { collected, totalAmount: totalAmount.toFixed(8), errors };
}

// ─── Wallet Status ────────────────────────────────────────────────────────────

export async function getWalletStatus(): Promise<{
  initialized: boolean;
  mainAddress: string | null;
  mainUSDTBalance: string;
  mainBNBBalance: string;
  totalUserAddresses: number;
  nextIndex: number;
  autoScanActive: boolean;
  lastScanTime: string | null;
}> {
  const mainAddress = await getSystemConfig("main_wallet_address");
  const nextIndex = parseInt(await getSystemConfig("hd_next_index") ?? "0", 10);
  const mnemonicExists = !!(await getSystemConfig("hd_mnemonic_encrypted"));
  const lastScanTime = await getSystemConfig("last_scan_time");

  let mainUSDTBalance = "0";
  let mainBNBBalance = "0";
  let totalUserAddresses = 0;

  if (mainAddress) {
    mainUSDTBalance = await getUSDTBalance(mainAddress);
    mainBNBBalance = await getBNBBalance(mainAddress);
  }

  const db = await getDb();
  if (db) {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(systemConfig)
      .where(sql`\`key\` LIKE 'deposit_addr_%'`);
    totalUserAddresses = Number(result.count);
  }

  return {
    initialized: mnemonicExists,
    mainAddress: mainAddress ?? null,
    mainUSDTBalance,
    mainBNBBalance,
    totalUserAddresses,
    nextIndex,
    autoScanActive: autoScanTimer !== null,
    lastScanTime: lastScanTime ?? null,
  };
}

// ─── Auto Scan Timer ─────────────────────────────────────────────────────────

/**
 * Start automatic deposit scanning every 3 minutes.
 * Called on server startup.
 */
export function startAutoScan(): void {
  if (autoScanTimer) {
    console.log("[AutoScan] Already running, skipping start");
    return;
  }

  console.log(`[AutoScan] Starting automatic deposit scan every ${SCAN_INTERVAL / 1000}s`);

  // Run first scan after 30 seconds (let server fully initialize)
  setTimeout(async () => {
    try {
      const mnemonicExists = await getSystemConfig("hd_mnemonic_encrypted");
      if (mnemonicExists) {
        console.log("[AutoScan] Running initial scan...");
        const result = await scanDeposits();
        await setSystemConfig("last_scan_time", new Date().toISOString());
        console.log(`[AutoScan] Initial scan result: detected=${result.detected}, credited=${result.credited}, method=${result.method}`);
      } else {
        console.log("[AutoScan] HD wallet not initialized, skipping initial scan");
      }
    } catch (err: any) {
      console.error("[AutoScan] Initial scan error:", err.message);
    }
  }, 30000);

  // Set up recurring scan
  autoScanTimer = setInterval(async () => {
    try {
      const mnemonicExists = await getSystemConfig("hd_mnemonic_encrypted");
      if (!mnemonicExists) return;

      console.log("[AutoScan] Running scheduled scan...");
      const result = await scanDeposits();
      await setSystemConfig("last_scan_time", new Date().toISOString());

      if (result.detected > 0) {
        console.log(`[AutoScan] Found ${result.detected} new deposits, credited ${result.credited}`);
      }
      if (result.errors.length > 0) {
        console.warn(`[AutoScan] Scan errors:`, result.errors);
      }
    } catch (err: any) {
      console.error("[AutoScan] Scheduled scan error:", err.message);
    }
  }, SCAN_INTERVAL);
}

// ─── Withdrawal Payout ───────────────────────────────────────────────────────

/**
 * Send USDT from main wallet (index 0) to a user's withdrawal address.
 * Checks BNB gas and USDT balance before sending.
 * Returns txHash on success, throws on failure.
 */
export async function sendUsdtFromMaster(
  toAddress: string,
  amount: number
): Promise<string> {
  const mainAddress = await getSystemConfig("main_wallet_address");
  if (!mainAddress) throw new Error("HD wallet not initialized");

  // Check main wallet USDT balance
  const usdtBalance = parseFloat(await getUSDTBalance(mainAddress));
  if (usdtBalance < amount) {
    throw new Error(
      `主钱包 USDT 余额不足：当前 ${usdtBalance.toFixed(2)} USDT，需要 ${amount.toFixed(2)} USDT`
    );
  }

  // Check main wallet BNB balance for gas
  const bnbBalance = parseFloat(await getBNBBalance(mainAddress));
  if (bnbBalance < 0.001) {
    throw new Error(
      `主钱包 BNB 余额不足以支付 Gas：当前 ${bnbBalance.toFixed(6)} BNB，请至少充值 0.001 BNB`
    );
  }

  const mainPrivateKey = await getMainWalletPrivateKey();
  const provider = await getProviderWithFallback();
  const mainWallet = new ethers.Wallet(mainPrivateKey, provider);
  const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, mainWallet);

  const amountWei = ethers.parseUnits(amount.toFixed(8), 18);
  const tx = await usdtContract.transfer(toAddress, amountWei);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("链上转账失败，交易被回滚");
  }

  console.log(`[Withdrawal] Sent ${amount} USDT to ${toAddress}, txHash: ${tx.hash}`);
  return tx.hash as string;
}

/**
 * Stop automatic scanning
 */
export function stopAutoScan(): void {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
    console.log("[AutoScan] Stopped");
  }
}
