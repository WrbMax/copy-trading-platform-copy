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

// ─── RPC Transfer Event Scan Detection (Method 2) ────────────────────────────

/**
 * Detect deposits by scanning on-chain USDT Transfer events via eth_getLogs.
 * This replaces the old balance-snapshot approach and fixes the repeated-deposit
 * blind spot: each Transfer event carries its own TxHash, so every individual
 * transfer is independently recorded and deduplicated — even when the user sends
 * multiple deposits to the same address without the balance being swept first.
 *
 * Algorithm:
 *  1. Read `last_block_{address}` from system_config (default: current block - 5000).
 *  2. Call eth_getLogs for Transfer events on the USDT contract where `to` = deposit address.
 *  3. For each matching log, decode the amount and call creditDeposit with the real TxHash.
 *  4. Update `last_block_{address}` to the latest scanned block.
 *
 * Dedup is handled by creditDeposit via TxHash uniqueness in the deposits table.
 */
async function detectByTransferEvents(
  userId: number,
  address: string,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<{ detected: number; credited: number }> {
  const lastBlockKey = `last_block_${address.toLowerCase()}`;
  const lastBlockStr = await getSystemConfig(lastBlockKey);

  let fromBlock: number;
  try {
    const provider = await getProviderWithFallback();
    const currentBlock = await provider.getBlockNumber();
    // First run: scan last 5000 blocks (~4 hours on BSC)
    fromBlock = lastBlockStr ? parseInt(lastBlockStr, 10) + 1 : Math.max(0, currentBlock - 5000);
  } catch {
    return { detected: 0, credited: 0 };
  }

  try {
    const provider = await getProviderWithFallback();
    const currentBlock = await provider.getBlockNumber();

    if (fromBlock > currentBlock) {
      return { detected: 0, credited: 0 };
    }

    // Limit scan range to 2000 blocks per round to avoid RPC limits
    const toBlock = Math.min(currentBlock, fromBlock + 2000);

    // ERC-20 Transfer event topic
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    // Pad address to 32-byte topic
    const addressTopic = "0x" + address.toLowerCase().replace("0x", "").padStart(64, "0");

    const logs = await provider.getLogs({
      address: USDT_CONTRACT,
      topics: [transferTopic, null, addressTopic],
      fromBlock,
      toBlock,
    });

    let detected = 0;
    let credited = 0;

    for (const log of logs) {
      try {
        const amount = parseFloat(ethers.formatUnits(log.data, 18));
        if (amount < 0.001) continue;

        const fromAddr = "0x" + log.topics[1].slice(26);
        const txHash = log.transactionHash;

        const didCredit = await creditDeposit(
          db, userId, amount, address, txHash, fromAddr,
          "链上Transfer事件自动检测"
        );
        detected++;
        if (didCredit) credited++;
      } catch (logErr: any) {
        console.error(`[Scan] Error processing log ${log.transactionHash}:`, logErr.message);
      }
    }

    // Always advance the last scanned block
    await setSystemConfig(lastBlockKey, toBlock.toString());

    // Also keep balance snapshot in sync (for display purposes)
    try {
      const currentBalance = await getUSDTBalance(address);
      const snapshotKey = `balance_snapshot_${address.toLowerCase()}`;
      await setSystemConfig(snapshotKey, parseFloat(currentBalance).toFixed(8));
    } catch {}

    return { detected, credited };
  } catch (err: any) {
    console.error(`[Scan] Transfer event scan failed for ${address}:`, err.message);
    return { detected: 0, credited: 0 };
  }
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

        // ── Method 2: Transfer Event Scan (replaces old RPC balance snapshot) ──
        // Always run: scans on-chain Transfer events by block range, dedup by TxHash.
        // Correctly handles repeated deposits to the same address without sweeping.
        if (!bscscanFound) {
          try {
            const { detected: evDetected, credited: evCredited } = await detectByTransferEvents(userId, address, db);
            if (evDetected > 0) {
              methodUsed = methodUsed === "none" ? "rpc_transfer_events" : methodUsed + "+rpc_transfer_events";
              detected += evDetected;
              credited += evCredited;
            }
          } catch (rpcErr: any) {
            errors.push(`Transfer event scan for user ${userId}: ${rpcErr.message}`);
          }
        } else {
          // BSCScan found deposits, still advance the block pointer for Transfer scan
          try {
            const provider = await getProviderWithFallback();
            const currentBlock = await provider.getBlockNumber();
            const lastBlockKey = `last_block_${address.toLowerCase()}`;
            await setSystemConfig(lastBlockKey, currentBlock.toString());
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
