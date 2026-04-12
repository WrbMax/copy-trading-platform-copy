/**
 * Copy Trading Engine
 *
 * Uses OKX WebSocket private channel to subscribe to signal source account position changes.
 * When a position change is detected (open/close/add/reduce), it automatically executes
 * copy trades on all subscribed user accounts with their configured multipliers.
 */
import WebSocket from "ws";
import crypto from "crypto";
import http from "http";
import https from "https";

// Increase default connection pool limits for high-concurrency exchange API calls
http.globalAgent.maxSockets = 100;
https.globalAgent.maxSockets = 100;

import {
  listSignalSources,
  getEnabledStrategiesForSignal,
  getExchangeApiById,
  createSignalLog,
  updateSignalLog,
  createCopyOrder,
  updateCopyOrder,
  listCopyOrdersBySignalLog,
  findUserOpenOrder,
  findAllUserOpenOrders,
  getUserById,
  updateUser,
  disableAllUserStrategies,
} from "./db";
import { decrypt } from "./crypto";
import {
  placeOrder,
  closePosition,
  OkxCredentials,
  OkxPosition,
  getInstrument,
} from "./okx-client";
import {
  BinanceCredentials,
  placeBinanceOrder,
  closeBinancePosition,
  getBinanceInstrument,
  toBinanceSymbol,
  getBinanceOrderDetail,
} from "./binance-client";
import {
  BybitCredentials,
  placeBybitOrder,
  closeBybitPosition,
  getBybitInstrument,
  toBybitSymbol,
  getBybitOrderDetail,
  getBybitClosedPnl,
} from "./bybit-client";
import {
  BitgetCredentials,
  openBitgetLong,
  openBitgetShort,
  closeBitgetLong,
  closeBitgetShort,
  getBitgetInstrument,
  toBitgetSymbol,
  getBitgetOrderDetail,
} from "./bitget-client";
import {
  GateCredentials,
  openGateLong,
  openGateShort,
  closeGateLong,
  closeGateShort,
  getGateInstrument,
  toGateContract,
  getGateOrderDetail,
} from "./gate-client";
import { getOkxOrderDetail } from "./okx-client";
import { processRevenueShare } from "./revenue-share";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PositionSnapshot {
  instId: string;
  posSide: "long" | "short" | "net";
  pos: number;        // positive = long, negative = short in net mode
  avgPx: number;
}

// Maximum age (in seconds) for a signal to be considered valid for execution
const SIGNAL_MAX_AGE_SECONDS = 30;

interface SignalSourceState {
  id: number;
  name: string;
  instId: string;
  creds: OkxCredentials;
  ws: WebSocket | null;
  positions: Map<string, PositionSnapshot>;
  reconnectTimer: NodeJS.Timeout | null;
  pingTimer: NodeJS.Timeout | null;
  isConnected: boolean;
  /** True until the first position snapshot is received and stored (skip stale signals on startup/reconnect) */
  initialSync: boolean;
}

type ChangeAction =
  | "open_long" | "open_short"
  | "close_long" | "close_short"
  | "add_long" | "add_short"
  | "reduce_long" | "reduce_short";

interface PositionChange {
  action: ChangeAction;
  instId: string;
  posSide: "long" | "short";
  contractsDelta: number;
  newPos: number;
  avgPx: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const sourceStates = new Map<number, SignalSourceState>();

// ─── OKX WebSocket Auth ───────────────────────────────────────────────────────

function buildLoginArgs(creds: OkxCredentials) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sign = crypto
    .createHmac("sha256", creds.secretKey)
    .update(ts + "GET" + "/users/self/verify")
    .digest("base64");
  return [{ apiKey: creds.apiKey, passphrase: creds.passphrase, timestamp: ts, sign }];
}

// ─── Position Change Detection ────────────────────────────────────────────────

function detectChanges(
  prev: Map<string, PositionSnapshot>,
  incoming: OkxPosition[]
): PositionChange[] {
  const changes: PositionChange[] = [];
  const seen = new Set<string>();

  for (const pos of incoming) {
    const rawPosSide = pos.posSide;
    const rawQty = parseFloat(pos.pos) || 0;
    const avgPx = parseFloat(pos.avgPx) || 0;

    if (rawPosSide === "net") {
      // Net mode: pos > 0 means long, pos < 0 means short, pos == 0 means flat
      const key = `${pos.instId}_net`;
      seen.add(key);
      const prevSnap = prev.get(key);
      const prevQty = prevSnap?.pos ?? 0; // signed

      if (rawQty === prevQty) continue;

      const prevAbs = Math.abs(prevQty);
      const newAbs = Math.abs(rawQty);
      const prevSide: "long" | "short" = prevQty >= 0 ? "long" : "short";
      const newSide: "long" | "short" = rawQty >= 0 ? "long" : "short";

      if (prevQty === 0 && rawQty > 0) {
        // Flat → Long
        changes.push({ action: "open_long", instId: pos.instId, posSide: "long", contractsDelta: newAbs, newPos: newAbs, avgPx });
      } else if (prevQty === 0 && rawQty < 0) {
        // Flat → Short
        changes.push({ action: "open_short", instId: pos.instId, posSide: "short", contractsDelta: newAbs, newPos: newAbs, avgPx });
      } else if (rawQty === 0) {
        // Any → Flat (close)
        changes.push({ action: `close_${prevSide}`, instId: pos.instId, posSide: prevSide, contractsDelta: prevAbs, newPos: 0, avgPx });
      } else if (prevSide !== newSide) {
        // Direction flip: close old side, open new side
        changes.push({ action: `close_${prevSide}`, instId: pos.instId, posSide: prevSide, contractsDelta: prevAbs, newPos: 0, avgPx });
        changes.push({ action: `open_${newSide}`, instId: pos.instId, posSide: newSide, contractsDelta: newAbs, newPos: newAbs, avgPx });
      } else if (newAbs > prevAbs) {
        // Same side, increased
        changes.push({ action: `add_${newSide}`, instId: pos.instId, posSide: newSide, contractsDelta: newAbs - prevAbs, newPos: newAbs, avgPx });
      } else {
        // Same side, reduced
        changes.push({ action: `reduce_${newSide}`, instId: pos.instId, posSide: newSide, contractsDelta: prevAbs - newAbs, newPos: newAbs, avgPx });
      }
      continue;
    }

    // Hedge mode (long/short)
    if (rawPosSide !== "long" && rawPosSide !== "short") continue;
    const posSide = rawPosSide as "long" | "short";
    const key = `${pos.instId}_${posSide}`;
    seen.add(key);

    const newQty = rawQty;
    const prevSnap = prev.get(key);
    const prevQty = prevSnap?.pos ?? 0;

    if (newQty === prevQty) continue;

    const delta = newQty - prevQty;

    if (prevQty === 0 && newQty > 0) {
      changes.push({ action: `open_${posSide}`, instId: pos.instId, posSide, contractsDelta: newQty, newPos: newQty, avgPx });
    } else if (newQty === 0 && prevQty > 0) {
      changes.push({ action: `close_${posSide}`, instId: pos.instId, posSide, contractsDelta: prevQty, newPos: 0, avgPx });
    } else if (delta > 0) {
      changes.push({ action: `add_${posSide}`, instId: pos.instId, posSide, contractsDelta: delta, newPos: newQty, avgPx });
    } else {
      changes.push({ action: `reduce_${posSide}`, instId: pos.instId, posSide, contractsDelta: Math.abs(delta), newPos: newQty, avgPx });
    }
  }

  // Positions that disappeared entirely (fully closed, not in new data)
  for (const [key, snap] of Array.from(prev.entries())) {
    if (!seen.has(key)) {
      const absPos = Math.abs(snap.pos);
      if (absPos > 0) {
        const side = snap.posSide === "net"
          ? (snap.pos > 0 ? "long" : "short")
          : snap.posSide;
        changes.push({
          action: `close_${side}` as ChangeAction,
          instId: snap.instId,
          posSide: side as "long" | "short",
          contractsDelta: absPos,
          newPos: 0,
          avgPx: snap.avgPx,
        });
      }
    }
  }

  return changes;
}

// ─── Copy Trade Execution ─────────────────────────────────────────────────────

// Map engine action to DB action enum
function toDbAction(action: ChangeAction): "open_long" | "open_short" | "close_long" | "close_short" | "close_all" {
  if (action === "open_long" || action === "add_long") return "open_long";
  if (action === "open_short" || action === "add_short") return "open_short";
  if (action === "close_long" || action === "reduce_long") return "close_long";
  if (action === "close_short" || action === "reduce_short") return "close_short";
  return "close_all";
}

async function executeCopyTrades(sourceId: number, change: PositionChange) {
  const dbAction = toDbAction(change.action);

  const logId = await createSignalLog({
    signalSourceId: sourceId,
    action: dbAction,
    symbol: change.instId.split("-")[0],
    quantity: change.contractsDelta.toFixed(8),
    price: change.avgPx > 0 ? change.avgPx.toFixed(8) : undefined,
    rawPayload: JSON.stringify(change),
    status: "processing",
    processedAt: new Date(),
  });

  const signalTime = Date.now();
  const userStrategies = await getEnabledStrategiesForSignal(sourceId);
  console.log(`[CopyEngine] ${change.action} ${change.contractsDelta} on ${change.instId} → ${userStrategies.length} users`);

  if (userStrategies.length === 0) {
    await updateSignalLog(logId, { status: "completed", errorMessage: "当前无订阅用户" });
    console.log(`[CopyEngine] Done: no subscribers`);
    return;
  }

  // ── Pre-fetch shared data ONCE (avoid repeated API calls per user) ──
  const instrument = await getInstrument(change.instId);
  const ctVal = instrument ? parseFloat(instrument.ctVal) : 0.01;

  // Pre-fetch exchange-specific instrument info (one per exchange type)
  const binanceSymbol = toBinanceSymbol(change.instId);
  const [binanceInfo] = await Promise.all([
    getBinanceInstrument(binanceSymbol),
  ]);

  // ── Execute all users in PARALLEL ──
  async function executeForUser(us: typeof userStrategies[0]): Promise<boolean> {
    const api = await getExchangeApiById(us.exchangeApiId);
    if (!api || !api.isActive) {
      console.log(`[CopyEngine] Skipping user ${us.userId}: API not active`);
      return false;
    }

    const userExchange = (api.exchange || "okx").toLowerCase();
    const multiplier = parseFloat(us.multiplier);

    // ── Balance check: skip and pause strategy if user balance is 0 on open actions ──
    const isOpenAction = ["open_long", "open_short", "add_long", "add_short"].includes(change.action);
    if (isOpenAction) {
      const user = await getUserById(us.userId);
      if (user && parseFloat(user.balance as string) <= 0) {
        console.log(`[CopyEngine] ⚠️ User ${us.userId} balance is 0, pausing all strategies`);
        await disableAllUserStrategies(us.userId);
        return false;
      }
    }

    // Calculate order size based on exchange type
    let sz: string;           // 各交易所原生单位（用于实际下单）
    let ethQty: number;       // 统一换算为 ETH 数量（用于存库显示）
    let exchangeOrderId: string | undefined;

    // ── 统一仓位计算：先换算为 ETH 数量，再转换为各交易所合约数 ──
    // 信号源是 OKX，ctVal = 0.1 ETH/张
    // baseEthQty = 信号张数 × 信号ctVal × 用户倍数  （单位：ETH）
    const baseEthQty = change.contractsDelta * ctVal * multiplier;
    // 信号源 ETH 数量（不含用户倍数，用于 signalQuantity 存库）
    const signalEthQty = change.contractsDelta * ctVal;

    if (userExchange === "binance") {
      // Binance 直接用 ETH 数量下单
      const precision = binanceInfo?.quantityPrecision ?? 3;
      const minQty = parseFloat(binanceInfo?.minQty ?? "0.001");
      let finalQty = baseEthQty;
      if (finalQty < minQty) finalQty = minQty;
      sz = finalQty.toFixed(precision);
      ethQty = parseFloat(sz);
      console.log(`[CopyEngine] Binance calc: user=${us.userId}, contracts=${change.contractsDelta}, ctVal=${ctVal}, mult=${multiplier}, baseEthQty=${baseEthQty}, finalSz=${sz} ETH`);
    } else if (userExchange === "bybit") {
      // Bybit 也直接用 ETH 数量下单
      const bybitSymbol = toBybitSymbol(change.instId);
      const bybitInfo = await getBybitInstrument(bybitSymbol);
      const step = parseFloat(bybitInfo?.qtyStep ?? "0.001");
      const minQty = parseFloat(bybitInfo?.minOrderQty ?? "0.001");
      const rounded = Math.max(minQty, Math.floor(baseEthQty / step) * step);
      const decimals = step.toString().includes(".") ? step.toString().split(".")[1].length : 0;
      sz = rounded.toFixed(decimals);
      ethQty = parseFloat(sz);
      console.log(`[CopyEngine] Bybit calc: user=${us.userId}, contracts=${change.contractsDelta}, ctVal=${ctVal}, mult=${multiplier}, baseEthQty=${baseEthQty}, finalSz=${sz} ETH`);
    } else if (userExchange === "bitget") {
      // Bitget USDT-M 永续：1张 = 0.01 ETH
      const bitgetCtVal = 0.01;
      const bitgetContracts = Math.floor(baseEthQty / bitgetCtVal);
      const minSzBitget = 1;
      sz = Math.max(minSzBitget, bitgetContracts).toString();
      ethQty = parseFloat(sz) * bitgetCtVal; // 换算回 ETH
      console.log(`[CopyEngine] Bitget calc: user=${us.userId}, contracts=${change.contractsDelta}, ctVal=${ctVal}, mult=${multiplier}, baseEthQty=${baseEthQty}, bitgetContracts=${sz}, ethQty=${ethQty} ETH`);
    } else if (userExchange === "gate") {
      // Gate.io ETH_USDT：1张 = 0.01 ETH（需从合约信息获取）
      const gateInstrument = await getGateInstrument(toGateContract(change.instId));
      const gateCtVal = gateInstrument ? parseFloat(gateInstrument.quanto_multiplier ?? "0.01") : 0.01;
      const gateContracts = Math.floor(baseEthQty / gateCtVal);
      const minSzGate = 1;
      sz = Math.max(minSzGate, gateContracts).toString();
      ethQty = parseFloat(sz) * gateCtVal; // 换算回 ETH
      console.log(`[CopyEngine] Gate calc: user=${us.userId}, contracts=${change.contractsDelta}, ctVal=${ctVal}, mult=${multiplier}, baseEthQty=${baseEthQty}, gateContracts=${sz}, ethQty=${ethQty} ETH`);
    } else {
      // OKX：信号源也是 OKX，ctVal 相同（0.1 ETH/张）
      const minSz = instrument ? parseFloat(instrument.minSz) : 0.01;
      const lotSz = instrument ? parseFloat(instrument.lotSz) : 0.01;
      let rawContracts = baseEthQty / ctVal; // = contractsDelta * multiplier
      let alignedContracts = Math.round(rawContracts / lotSz) * lotSz;
      if (alignedContracts < minSz) alignedContracts = minSz;
      const lotDecimals = lotSz.toString().includes(".") ? lotSz.toString().split(".")[1].length : 0;
      sz = alignedContracts.toFixed(lotDecimals);
      ethQty = alignedContracts * ctVal; // 换算为 ETH
      console.log(`[CopyEngine] OKX calc: user=${us.userId}, contracts=${change.contractsDelta}, ctVal=${ctVal}, mult=${multiplier}, baseEthQty=${baseEthQty}, okxContracts=${sz}, ethQty=${ethQty} ETH`);
    }

    // Insert pending order record
    // signalQuantity: 信号源原始数量（ETH，不含用户倍数）
    // actualQuantity: 实际下单数量（ETH，统一单位，含用户倍数）
    const orderId = await createCopyOrder({
      userId: us.userId,
      signalLogId: logId,
      signalSourceId: sourceId,
      exchangeApiId: us.exchangeApiId,
      exchange: userExchange as "binance" | "okx" | "bybit" | "bitget" | "gate",
      symbol: change.instId,
      action: dbAction,
      multiplier: us.multiplier,
      signalQuantity: signalEthQty.toFixed(8),  // 统一为 ETH
      actualQuantity: ethQty.toFixed(8),         // 统一为 ETH
      openPrice: change.avgPx > 0 ? change.avgPx.toFixed(8) : undefined,
      openTime: new Date(),
      status: "pending",
    });

    // Check signal freshness — skip if too old
    const elapsed = (Date.now() - signalTime) / 1000;
    if (elapsed > SIGNAL_MAX_AGE_SECONDS) {
      console.warn(`[CopyEngine] ⏰ Signal too old (${elapsed.toFixed(1)}s) for user ${us.userId}, skipping`);
      await updateCopyOrder(orderId, { status: "failed", errorMessage: `信号超时 (${elapsed.toFixed(1)}s)` });
      return false;
    }

    // Execute on exchange
    if (userExchange === "binance") {
      const binCreds: BinanceCredentials = {
        apiKey: decrypt(api.apiKeyEncrypted),
        secretKey: decrypt(api.secretKeyEncrypted),
      };
      if (change.action === "open_long" || change.action === "add_long") {
        const r = await placeBinanceOrder(binCreds, change.instId, "BUY", "LONG", sz);
        exchangeOrderId = String(r.orderId);
      } else if (change.action === "open_short" || change.action === "add_short") {
        const r = await placeBinanceOrder(binCreds, change.instId, "SELL", "SHORT", sz);
        exchangeOrderId = String(r.orderId);
      } else if (change.action === "close_long" || change.action === "reduce_long") {
        const r = await closeBinancePosition(binCreds, change.instId, "LONG", sz);
        exchangeOrderId = String(r.orderId);
      } else if (change.action === "close_short" || change.action === "reduce_short") {
        const r = await closeBinancePosition(binCreds, change.instId, "SHORT", sz);
        exchangeOrderId = String(r.orderId);
      }
    } else if (userExchange === "bybit") {
      const bybitCreds: BybitCredentials = {
        apiKey: decrypt(api.apiKeyEncrypted),
        secretKey: decrypt(api.secretKeyEncrypted),
      };
      if (change.action === "open_long" || change.action === "add_long") {
        const r = await placeBybitOrder(bybitCreds, change.instId, "Buy", "LONG", sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "open_short" || change.action === "add_short") {
        const r = await placeBybitOrder(bybitCreds, change.instId, "Sell", "SHORT", sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "close_long" || change.action === "reduce_long") {
        const r = await closeBybitPosition(bybitCreds, change.instId, "LONG", sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "close_short" || change.action === "reduce_short") {
        const r = await closeBybitPosition(bybitCreds, change.instId, "SHORT", sz);
        exchangeOrderId = r.orderId;
      }
    } else if (userExchange === "bitget") {
      const bitgetCreds: BitgetCredentials = {
        apiKey: decrypt(api.apiKeyEncrypted),
        secretKey: decrypt(api.secretKeyEncrypted),
        passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "",
      };
      if (change.action === "open_long" || change.action === "add_long") {
        const r = await openBitgetLong(bitgetCreds, change.instId, sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "open_short" || change.action === "add_short") {
        const r = await openBitgetShort(bitgetCreds, change.instId, sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "close_long" || change.action === "reduce_long") {
        const r = await closeBitgetLong(bitgetCreds, change.instId, sz);
        exchangeOrderId = r.orderId;
      } else if (change.action === "close_short" || change.action === "reduce_short") {
        const r = await closeBitgetShort(bitgetCreds, change.instId, sz);
        exchangeOrderId = r.orderId;
      }
    } else if (userExchange === "gate") {
      const gateCreds: GateCredentials = {
        apiKey: decrypt(api.apiKeyEncrypted),
        secretKey: decrypt(api.secretKeyEncrypted),
      };
      const gateQty = parseInt(sz, 10);
      if (change.action === "open_long" || change.action === "add_long") {
        const r = await openGateLong(gateCreds, change.instId, gateQty);
        exchangeOrderId = r.id.toString();
      } else if (change.action === "open_short" || change.action === "add_short") {
        const r = await openGateShort(gateCreds, change.instId, gateQty);
        exchangeOrderId = r.id.toString();
      } else if (change.action === "close_long" || change.action === "reduce_long") {
        const r = await closeGateLong(gateCreds, change.instId, gateQty);
        exchangeOrderId = r.id.toString();
      } else if (change.action === "close_short" || change.action === "reduce_short") {
        const r = await closeGateShort(gateCreds, change.instId, gateQty);
        exchangeOrderId = r.id.toString();
      }
    } else {
      // OKX (default)
      const userCreds: OkxCredentials = {
        apiKey: decrypt(api.apiKeyEncrypted),
        secretKey: decrypt(api.secretKeyEncrypted),
        passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "",
      };
      if (change.action === "open_long" || change.action === "add_long") {
        const r = await placeOrder(userCreds, change.instId, "buy", "long", sz);
        exchangeOrderId = r.ordId;
      } else if (change.action === "open_short" || change.action === "add_short") {
        const r = await placeOrder(userCreds, change.instId, "sell", "short", sz);
        exchangeOrderId = r.ordId;
      } else if (change.action === "close_long" || change.action === "reduce_long") {
        const r = await closePosition(userCreds, change.instId, "long", sz);
        exchangeOrderId = r.ordId;
      } else if (change.action === "close_short" || change.action === "reduce_short") {
        const r = await closePosition(userCreds, change.instId, "short", sz);
        exchangeOrderId = r.ordId;
      }
    }

    const orderTime = Date.now() - signalTime;
    console.log(`[CopyEngine] ✅ User ${us.userId}: ${change.action} ${sz} on ${change.instId}, ordId=${exchangeOrderId}, latency=${orderTime}ms`);

    const isCloseAction = ["close_long", "close_short", "reduce_long", "reduce_short"].includes(change.action);

    if (isCloseAction && exchangeOrderId) {
      // ── Close order: finalize PnL and trigger revenue share ──
      await updateCopyOrder(orderId, {
        status: "closed",
        exchangeOrderId: exchangeOrderId,
        closeTime: new Date(),
      });

      // Note: getBinanceOrderDetail has built-in retry logic (up to 3 attempts)
      // No need for a fixed wait here.

      try {
        let closePrice = 0;
        let fee = 0;
        let realizedPnl = 0; // Direct from exchange API

        // Query exchange for close order fill details
        if (userExchange === "binance") {
          const symbol = toBinanceSymbol(change.instId);
          const detail = await getBinanceOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, exchangeOrderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.commission) || 0);
          // Use API realizedPnl directly — this matches what users see in Binance
          realizedPnl = parseFloat(detail.realizedPnl) || 0;
        } else if (userExchange === "bybit") {
          const symbol = toBybitSymbol(change.instId);
          const detail = await getBybitOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, exchangeOrderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.cumExecFee) || 0);
          // Query closed PnL from Bybit /v5/position/closed-pnl endpoint
          realizedPnl = await getBybitClosedPnl(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            symbol, exchangeOrderId
          );
        } else if (userExchange === "bitget") {
          const symbol = toBitgetSymbol(change.instId);
          const detail = await getBitgetOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
            symbol, exchangeOrderId
          );
          closePrice = parseFloat(detail.avgPrice) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.profit) || 0;
        } else if (userExchange === "gate") {
          const detail = await getGateOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
            exchangeOrderId
          );
          closePrice = parseFloat(detail.fillPrice) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.pnl) || 0;
        } else {
          // OKX
          const detail = await getOkxOrderDetail(
            { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
            change.instId, exchangeOrderId
          );
          closePrice = parseFloat(detail.avgPx) || 0;
          fee = Math.abs(parseFloat(detail.fee) || 0);
          realizedPnl = parseFloat(detail.pnl) || 0;
        }

        // Find ALL matching open orders for this user/symbol/side
        const allOpenOrders = await findAllUserOpenOrders(us.userId, change.instId, change.action);
        const openOrder = allOpenOrders[0] || null; // Keep for backward compat (close order record)

        // ── Distribute PnL across ALL open orders ──
        // For Binance: calculate realizedPnl per-order using open/close prices (avoids FIFO distortion)
        // For other exchanges: use exchange-provided realizedPnl distributed proportionally by qty
        let rawPnl = realizedPnl; // For non-binance exchanges

        if (allOpenOrders.length > 0) {
          // Calculate total quantity across all open orders
          const totalQty = allOpenOrders.reduce((sum, o) => sum + parseFloat(o.actualQuantity || "0"), 0);

          // All exchanges: use exchange-provided realizedPnl, distribute proportionally by qty
          // This ensures PnL matches what users see in their exchange account
          for (const openOrd of allOpenOrders) {
            const ordQty = parseFloat(openOrd.actualQuantity || "0");
            const ratio = totalQty > 0 ? ordQty / totalQty : 1 / allOpenOrders.length;
            const ordRawPnl = rawPnl * ratio;
            const ordFee = fee * ratio;
            const ordNetPnl = ordRawPnl - ordFee;

            await updateCopyOrder(openOrd.id, {
              closePrice: closePrice.toFixed(8),
              closeTime: new Date(),
              closeOrderId: exchangeOrderId,
              realizedPnl: ordRawPnl.toFixed(8),
              fee: ordFee.toFixed(8),
              netPnl: ordNetPnl.toFixed(8),
              status: "closed",
            });
            console.log(`[CopyEngine] 📊 User ${us.userId} order ${openOrd.id}: ratio=${ratio.toFixed(4)}, netPnl=${ordNetPnl.toFixed(4)}`);
          }
        }

        const netPnl = rawPnl - fee;

        // Update the close order record with price and PnL info
        await updateCopyOrder(orderId, {
          openPrice: closePrice.toFixed(8),
          closePrice: closePrice.toFixed(8),
          realizedPnl: rawPnl.toFixed(8),
          fee: fee.toFixed(8),
          netPnl: netPnl.toFixed(8),
        });

        // Note: totalProfit/totalLoss on users table is NOT updated here.
        // The frontend stats are computed live from copy_orders (open_long/open_short only)
        // via getUserOrderStats(), which is the single source of truth.

        console.log(`[CopyEngine] 📊 User ${us.userId}: totalPnl=${rawPnl.toFixed(4)}, fee=${fee.toFixed(4)}, netPnl=${netPnl.toFixed(4)}, closePrice=${closePrice}, openOrders=${allOpenOrders.length}`);

        // Trigger revenue share for profitable orders (use total netPnl)
        // Always use the close order's orderId so revenueShareDeducted is written to the close order
        const revenueOrderId = orderId;
        if (netPnl > 0) {
          try {
            await processRevenueShare({
              copyOrderId: revenueOrderId,
              traderId: us.userId,
              netPnl,
            });
            console.log(`[CopyEngine] 💰 Revenue share processed for user ${us.userId}, netPnl=${netPnl.toFixed(4)}`);
          } catch (rsErr: unknown) {
            const rsMsg = rsErr instanceof Error ? rsErr.message : String(rsErr);
            console.error(`[CopyEngine] ⚠️ Revenue share failed for user ${us.userId}: ${rsMsg}`);
          }
        }
      } catch (pnlErr: unknown) {
        const pnlMsg = pnlErr instanceof Error ? pnlErr.message : String(pnlErr);
        console.error(`[CopyEngine] ⚠️ PnL finalization failed for user ${us.userId}: ${pnlMsg}`);
      }
    } else {
      // Open order: set to 'open' status (use signal avgPx as initial price)
      await updateCopyOrder(orderId, {
        status: "open",
        exchangeOrderId: exchangeOrderId,
        openTime: new Date(),
      });

      // Async: query actual fill price from exchange and update openPrice
      if (exchangeOrderId) {
        (async () => {
          try {
            let actualOpenPrice: number | null = null;

            if (userExchange === "binance") {
              const symbol = toBinanceSymbol(change.instId);
              const detail = await getBinanceOrderDetail(
                { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
                symbol, exchangeOrderId
              );
              actualOpenPrice = parseFloat(detail.avgPrice) || null;
            } else if (userExchange === "bybit") {
              const symbol = toBybitSymbol(change.instId);
              const detail = await getBybitOrderDetail(
                { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
                symbol, exchangeOrderId
              );
              actualOpenPrice = parseFloat(detail.avgPrice) || null;
            } else if (userExchange === "bitget") {
              const symbol = toBitgetSymbol(change.instId);
              const detail = await getBitgetOrderDetail(
                { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
                symbol, exchangeOrderId
              );
              actualOpenPrice = parseFloat(detail.avgPrice) || null;
            } else if (userExchange === "gate") {
              const detail = await getGateOrderDetail(
                { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted) },
                exchangeOrderId
              );
              actualOpenPrice = parseFloat(detail.fillPrice) || null;
            } else {
              // OKX
              const detail = await getOkxOrderDetail(
                { apiKey: decrypt(api.apiKeyEncrypted), secretKey: decrypt(api.secretKeyEncrypted), passphrase: api.passphraseEncrypted ? decrypt(api.passphraseEncrypted) : "" },
                change.instId, exchangeOrderId
              );
              actualOpenPrice = parseFloat(detail.avgPx) || null;
            }

            if (actualOpenPrice && actualOpenPrice > 0) {
              await updateCopyOrder(orderId, { openPrice: actualOpenPrice.toFixed(8) });
              console.log(`[CopyEngine] 📌 User ${us.userId} order ${orderId}: actual openPrice=${actualOpenPrice}`);
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[CopyEngine] ⚠️ Failed to fetch actual open price for user ${us.userId} order ${orderId}: ${msg}`);
          }
        })();
      }
    }
    return true;
  }

  // ── Batched parallel execution with concurrency control ──
  // Process users in batches to avoid overwhelming exchange APIs and connection pools.
  // Each batch runs fully in parallel; batches run sequentially.
  const BATCH_SIZE = 20; // Max concurrent exchange API calls per batch
  const allResults: boolean[] = [];

  for (let i = 0; i < userStrategies.length; i += BATCH_SIZE) {
    const batch = userStrategies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(userStrategies.length / BATCH_SIZE);
    if (totalBatches > 1) {
      console.log(`[CopyEngine] Batch ${batchNum}/${totalBatches}: ${batch.length} users`);
    }

    const batchResults = await Promise.allSettled(
      batch.map(async (us) => {
        try {
          return await executeForUser(us);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[CopyEngine] ❌ User ${us.userId} copy failed: ${msg}`);
          try {
            const recentOrders = await listCopyOrdersBySignalLog(logId, us.userId);
            if (recentOrders.length > 0) {
              await updateCopyOrder(recentOrders[0].id, { status: "failed", errorMessage: msg });
            }
          } catch { /* ignore secondary error */ }
          return false;
        }
      })
    );

    for (const r of batchResults) {
      allResults.push(r.status === "fulfilled" && r.value === true);
    }
  }

  const successCount = allResults.filter(Boolean).length;
  const totalTime = Date.now() - signalTime;

  await updateSignalLog(logId, {
    status: "completed",
    errorMessage: successCount === 0
      ? `所有 ${userStrategies.length} 个用户跟单失败`
      : successCount < userStrategies.length
        ? `${successCount}/${userStrategies.length} 个用户跟单成功`
        : undefined,
  });
  console.log(`[CopyEngine] Done: ${successCount}/${userStrategies.length} succeeded, total=${totalTime}ms, batches=${Math.ceil(userStrategies.length / BATCH_SIZE)}`);
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

function connectSource(state: SignalSourceState) {
  if (state.ws) {
    try { state.ws.terminate(); } catch { /* ignore */ }
    state.ws = null;
  }

  console.log(`[CopyEngine] Connecting WS for "${state.name}" (${state.instId})`);
  const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/private");
  state.ws = ws;

  ws.on("open", () => {
    console.log(`[CopyEngine] WS open for "${state.name}", logging in...`);
    ws.send(JSON.stringify({ op: "login", args: buildLoginArgs(state.creds) }));

    if (state.pingTimer) clearInterval(state.pingTimer);
    state.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25000);
  });

  ws.on("message", (raw: Buffer | string) => {
    const msg = raw.toString();
    if (msg === "pong") return;

    let data: Record<string, unknown>;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.event === "login") {
      if (data.code === "0") {
        console.log(`[CopyEngine] ✅ Logged in for "${state.name}", subscribing...`);
        state.isConnected = true;
        ws.send(JSON.stringify({
          op: "subscribe",
          args: [{ channel: "positions", instType: "SWAP" }],
        }));
      } else {
        console.error(`[CopyEngine] ❌ Login failed for "${state.name}": ${data.msg}`);
      }
      return;
    }

    if (data.event === "subscribe") {
      console.log(`[CopyEngine] ✅ Subscribed to positions for "${state.name}"`);
      return;
    }

    if (
      data.arg && typeof data.arg === "object" &&
      (data.arg as Record<string, unknown>).channel === "positions" &&
      Array.isArray(data.data)
    ) {
      const incoming = data.data as OkxPosition[];
      const relevant = incoming.filter(
        (p) => state.instId === "ALL" || p.instId === state.instId
      );
      if (relevant.length === 0) return;

      // On initial sync (first snapshot after connect/reconnect), just store baseline — don't execute trades
      if (state.initialSync) {
        console.log(`[CopyEngine] Initial sync for "${state.name}": storing baseline positions, skipping trade execution`);
        for (const pos of relevant) {
          const rawPosSide = pos.posSide;
          if (rawPosSide !== "long" && rawPosSide !== "short" && rawPosSide !== "net") continue;
          const key = `${pos.instId}_${rawPosSide}`;
          const qty = parseFloat(pos.pos) || 0;
          if (qty === 0) {
            state.positions.delete(key);
          } else {
            state.positions.set(key, {
              instId: pos.instId,
              posSide: rawPosSide as "long" | "short" | "net",
              pos: qty,
              avgPx: parseFloat(pos.avgPx) || 0,
            });
          }
        }
        state.initialSync = false;
        return;
      }

      const changes = detectChanges(state.positions, relevant);

      // Update snapshot (support both net and hedge mode)
      for (const pos of relevant) {
        const rawPosSide = pos.posSide;
        if (rawPosSide !== "long" && rawPosSide !== "short" && rawPosSide !== "net") continue;
        const key = `${pos.instId}_${rawPosSide}`;
        const qty = parseFloat(pos.pos) || 0; // signed for net mode
        if (qty === 0 && rawPosSide !== "net") {
          state.positions.delete(key);
        } else if (qty === 0 && rawPosSide === "net") {
          state.positions.delete(key);
        } else {
          state.positions.set(key, {
            instId: pos.instId,
            posSide: rawPosSide as "long" | "short" | "net",
            pos: qty,
            avgPx: parseFloat(pos.avgPx) || 0,
          });
        }
      }

      for (const change of changes) {
        console.log(`[CopyEngine] Change: ${change.action} ${change.contractsDelta} on ${change.instId}`);
        executeCopyTrades(state.id, change).catch((err: unknown) =>
          console.error("[CopyEngine] executeCopyTrades error:", err)
        );
      }
    }
  });

  ws.on("close", (code: number, reason: Buffer) => {
    console.log(`[CopyEngine] WS closed for "${state.name}": ${code} ${reason.toString()}`);
    state.isConnected = false;
    if (state.pingTimer) { clearInterval(state.pingTimer); state.pingTimer = null; }
    scheduleReconnect(state);
  });

  ws.on("error", (err: Error) => {
    console.error(`[CopyEngine] WS error for "${state.name}": ${err.message}`);
  });
}

function scheduleReconnect(state: SignalSourceState) {
  if (state.reconnectTimer) return;
  console.log(`[CopyEngine] Reconnecting "${state.name}" in 10s...`);
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectSource(state);
  }, 10000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startCopyEngine() {
  console.log("[CopyEngine] Starting...");
  const sources = await listSignalSources(true);
  console.log(`[CopyEngine] ${sources.length} active signal sources`);

  for (const src of sources) {
    if (!src.apiKeyEncrypted || !src.apiSecretEncrypted) {
      console.log(`[CopyEngine] Skipping "${src.name}": no API credentials`);
      continue;
    }
    if (src.exchange !== "okx") {
      console.log(`[CopyEngine] Skipping "${src.name}": exchange "${src.exchange}" not supported yet`);
      continue;
    }

    const creds: OkxCredentials = {
      apiKey: decrypt(src.apiKeyEncrypted),
      secretKey: decrypt(src.apiSecretEncrypted),
      passphrase: src.passphraseEncrypted ? decrypt(src.passphraseEncrypted) : "",
    };

    const state: SignalSourceState = {
      id: src.id,
      name: src.name,
      instId: src.tradingPair.includes("-") ? src.tradingPair : `${src.symbol}-USDT-SWAP`,
      creds,
      ws: null,
      positions: new Map(),
      reconnectTimer: null,
      pingTimer: null,
      isConnected: false,
      initialSync: true,
    };

    sourceStates.set(src.id, state);
    connectSource(state);
  }

  console.log("[CopyEngine] Started.");
}

export async function reloadSignalSource(sourceId: number) {
  const existing = sourceStates.get(sourceId);
  if (existing) {
    if (existing.ws) try { existing.ws.terminate(); } catch { /* ignore */ }
    if (existing.pingTimer) clearInterval(existing.pingTimer);
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
    sourceStates.delete(sourceId);
  }

  const sources = await listSignalSources(false);
  const src = sources.find((s) => s.id === sourceId);
  if (!src || !src.isActive || !src.apiKeyEncrypted || !src.apiSecretEncrypted) return;

  const creds: OkxCredentials = {
    apiKey: decrypt(src.apiKeyEncrypted),
    secretKey: decrypt(src.apiSecretEncrypted),
    passphrase: src.passphraseEncrypted ? decrypt(src.passphraseEncrypted) : "",
  };

  const state: SignalSourceState = {
    id: src.id,
    name: src.name,
    instId: src.tradingPair.includes("-") ? src.tradingPair : `${src.symbol}-USDT-SWAP`,
    creds,
    ws: null,
    positions: new Map(),
    reconnectTimer: null,
    pingTimer: null,
    isConnected: false,
    initialSync: true,
  };

  sourceStates.set(src.id, state);
  connectSource(state);
}

export function getCopyEngineStatus(): Array<{
  id: number;
  name: string;
  instId: string;
  connected: boolean;
  positions: PositionSnapshot[];
}> {
  return Array.from(sourceStates.values()).map((s: SignalSourceState) => ({
    id: s.id,
    name: s.name,
    instId: s.instId,
    connected: s.isConnected,
    positions: Array.from(s.positions.values()),
  }));
}
