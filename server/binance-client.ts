/**
 * Binance USDT-M Futures REST client.
 * Supports placing and closing perpetual contract orders.
 */
import crypto from "crypto";

export interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
}

const BASE_URL = "https://fapi.binance.com";

function sign(secretKey: string, queryString: string): string {
  return crypto.createHmac("sha256", secretKey).update(queryString).digest("hex");
}

async function binanceRequest<T>(
  creds: BinanceCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp };
  const queryString = Object.entries(allParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const signature = sign(creds.secretKey, queryString);
  const fullQuery = `${queryString}&signature=${signature}`;

  const url =
    method === "GET" || method === "DELETE"
      ? `${BASE_URL}${path}?${fullQuery}`
      : `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": creds.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? fullQuery : undefined,
  });

  const data = (await res.json()) as T & { code?: number; msg?: string };
  if ((data as { code?: number }).code && (data as { code?: number }).code! < 0) {
    throw new Error(`Binance API error ${(data as { code?: number }).code}: ${(data as { msg?: string }).msg}`);
  }
  return data;
}

/**
 * Convert OKX instId (e.g. ETH-USDT-SWAP) to Binance symbol (e.g. ETHUSDT)
 */
export function toBinanceSymbol(instId: string): string {
  // ETH-USDT-SWAP → ETHUSDT
  const parts = instId.split("-");
  if (parts.length >= 2) {
    return parts[0] + parts[1];
  }
  return instId.replace(/-/g, "");
}

export interface BinanceOrderResult {
  orderId: number;
  symbol: string;
  status: string;
  side: string;
  positionSide: string;
  origQty: string;
  avgPrice: string;
}

/**
 * Check if the Binance account is in hedge (dual-side) position mode.
 * Returns true if hedge mode, false if one-way mode.
 */
// Cache hedge mode per API key for 2 minutes
const hedgeModeCache = new Map<string, { value: boolean; expiry: number }>();

export async function isHedgeMode(creds: BinanceCredentials): Promise<boolean> {
  const cacheKey = creds.apiKey;
  const cached = hedgeModeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.value;
  try {
    const data = await binanceRequest<{ dualSidePosition: boolean }>(creds, "GET", "/fapi/v1/positionSide/dual", {});
    const result = data.dualSidePosition === true;
    hedgeModeCache.set(cacheKey, { value: result, expiry: Date.now() + 2 * 60 * 1000 });
    return result;
  } catch {
    return false;
  }
}

/**
 * Set leverage for a specific symbol.
 * Silently ignores "no need to change" errors.
 */
// Cache leverage settings per apiKey+symbol for 5 minutes
const leverageCache = new Map<string, number>();

export async function setLeverage(creds: BinanceCredentials, symbol: string, leverage: number): Promise<void> {
  const cacheKey = `${creds.apiKey}_${symbol}_${leverage}`;
  if (leverageCache.has(cacheKey)) return; // Already set recently
  try {
    await binanceRequest(creds, "POST", "/fapi/v1/leverage", { symbol, leverage });
    console.log(`[Binance] Leverage set to ${leverage}x for ${symbol}`);
    leverageCache.set(cacheKey, Date.now());
    // Clean old entries after 5 minutes
    setTimeout(() => leverageCache.delete(cacheKey), 5 * 60 * 1000);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // -4028 = Leverage not changed (already at target)
    if (msg.includes("-4028") || msg.includes("4028")) {
      leverageCache.set(cacheKey, Date.now());
      setTimeout(() => leverageCache.delete(cacheKey), 5 * 60 * 1000);
    } else {
      console.warn(`[Binance] Failed to set leverage: ${msg}`);
    }
  }
}

/**
 * Place a Binance futures order.
 * Automatically detects account position mode (one-way vs hedge) and adapts.
 * Auto-sets leverage to 20x before placing the order.
 * @param side "BUY" | "SELL"
 * @param positionSide "LONG" | "SHORT" (used in hedge mode; ignored in one-way mode)
 * @param quantity contract quantity (in base asset, e.g. ETH amount)
 * @param isClose whether this is a closing order (reduceOnly in one-way mode)
 */
export async function placeBinanceOrder(
  creds: BinanceCredentials,
  instId: string,
  side: "BUY" | "SELL",
  positionSide: "LONG" | "SHORT",
  quantity: string,
  isClose = false
): Promise<BinanceOrderResult> {
  const symbol = toBinanceSymbol(instId);
  const hedgeMode = await isHedgeMode(creds);
  // Auto-set leverage to 20x before placing order
  if (!isClose) {
    await setLeverage(creds, symbol, 20);
  }
  console.log(`[Binance] Order: symbol=${symbol}, side=${side}, positionSide=${positionSide}, qty=${quantity}, hedgeMode=${hedgeMode}, isClose=${isClose}`);

  if (hedgeMode) {
    // Hedge mode: pass positionSide explicitly
    return binanceRequest<BinanceOrderResult>(creds, "POST", "/fapi/v1/order", {
      symbol,
      side,
      positionSide,
      type: "MARKET",
      quantity,
    });
  } else {
    // One-way mode: no positionSide; use reduceOnly for close orders
    const params: Record<string, string | number | boolean> = {
      symbol,
      side,
      type: "MARKET",
      quantity,
    };
    if (isClose) params.reduceOnly = true;
    console.log(`[Binance] One-way params:`, JSON.stringify(params));
    return binanceRequest<BinanceOrderResult>(creds, "POST", "/fapi/v1/order", params);
  }
}

/**
 * Close a Binance futures position.
 * side is the closing side: closing LONG = SELL, closing SHORT = BUY
 */
export async function closeBinancePosition(
  creds: BinanceCredentials,
  instId: string,
  positionSide: "LONG" | "SHORT",
  quantity: string
): Promise<BinanceOrderResult> {
  const side = positionSide === "LONG" ? "SELL" : "BUY";
  return placeBinanceOrder(creds, instId, side, positionSide, quantity, true);
}

/**
 * Get current futures positions for a symbol.
 */
export async function getBinancePositions(
  creds: BinanceCredentials,
  symbol?: string
): Promise<Array<{ symbol: string; positionSide: string; positionAmt: string; entryPrice: string; unrealizedProfit: string }>> {
  const params: Record<string, string> = {};
  if (symbol) params.symbol = symbol;
  const data = await binanceRequest<Array<{ symbol: string; positionSide: string; positionAmt: string; entryPrice: string; unrealizedProfit: string }>>(
    creds, "GET", "/fapi/v2/positionRisk", params
  );
  return data.filter((p) => parseFloat(p.positionAmt) !== 0);
}

/**
 * Get Binance futures account balance.
 */
export async function getBinanceBalance(
  creds: BinanceCredentials
): Promise<{ totalWalletBalance: string; availableBalance: string }> {
  const data = await binanceRequest<Array<{ asset: string; totalWalletBalance: string; availableBalance: string }>>(
    creds, "GET", "/fapi/v2/account", {}
  );
  // Return USDT balance
  const usdt = (data as unknown as { totalWalletBalance: string; availableBalance: string; assets?: Array<{ asset: string; walletBalance: string; availableBalance: string }> });
  if (usdt.totalWalletBalance) return { totalWalletBalance: usdt.totalWalletBalance, availableBalance: usdt.availableBalance };
  return { totalWalletBalance: "0", availableBalance: "0" };
}

/**
 * Query a specific Binance futures order to get fill details.
 */
export async function getBinanceOrderDetail(
  creds: BinanceCredentials,
  symbol: string,
  orderId: string
): Promise<{ avgPrice: string; executedQty: string; realizedPnl: string; commission: string; status: string }> {
  const data = await binanceRequest<{
    avgPrice: string; executedQty: string; realizedPnl: string; status: string;
  }>(creds, "GET", "/fapi/v1/order", { symbol, orderId });
  // Also get trades for commission
  let commission = "0";
  try {
    const trades = await binanceRequest<Array<{ commission: string; commissionAsset: string }>>(
      creds, "GET", "/fapi/v1/userTrades", { symbol, orderId, limit: 10 }
    );
    commission = trades
      .filter(t => t.commissionAsset === "USDT")
      .reduce((sum, t) => sum + parseFloat(t.commission), 0)
      .toFixed(8);
  } catch { /* ignore trade query errors */ }
  return {
    avgPrice: data.avgPrice || "0",
    executedQty: data.executedQty || "0",
    realizedPnl: data.realizedPnl || "0",
    commission,
    status: data.status || "UNKNOWN",
  };
}

/**
 * Get Binance futures instrument info (for contract size calculation).
 * Cached for 5 minutes to avoid repeated API calls.
 */
const binanceInstrumentCache = new Map<string, { data: { quantityPrecision: number; pricePrecision: number; minQty: string }; expiry: number }>();

export async function getBinanceInstrument(
  symbol: string
): Promise<{ quantityPrecision: number; pricePrecision: number; minQty: string } | null> {
  const cached = binanceInstrumentCache.get(symbol);
  if (cached && Date.now() < cached.expiry) return cached.data;
  try {
    const data = await fetch(`${BASE_URL}/fapi/v1/exchangeInfo`).then((r) => r.json()) as {
      symbols: Array<{ symbol: string; quantityPrecision: number; pricePrecision: number; filters: Array<{ filterType: string; minQty: string }> }>;
    };
    const info = data.symbols.find((s) => s.symbol === symbol);
    if (!info) return null;
    const lotFilter = info.filters.find((f) => f.filterType === "LOT_SIZE");
    const result = {
      quantityPrecision: info.quantityPrecision,
      pricePrecision: info.pricePrecision,
      minQty: lotFilter?.minQty ?? "0.001",
    };
    binanceInstrumentCache.set(symbol, { data: result, expiry: Date.now() + 5 * 60 * 1000 });
    return result;
  } catch {
    return null;
  }
}

/**
 * Calculate Binance order quantity from USDT amount.
 * For ETHUSDT: quantity is in ETH (not contracts like OKX).
 * OKX ETH-USDT-SWAP: 1 contract = 0.01 ETH (ctVal=0.01)
 * So to convert OKX contracts to Binance ETH quantity:
 *   binanceQty = okxContracts * ctVal (0.01) → but we need current price
 */
export function calcBinanceQty(
  okxContracts: number,
  okxCtVal: number, // OKX contract value in ETH (e.g. 0.01 for ETH-USDT-SWAP)
  quantityPrecision: number
): string {
  const ethAmount = okxContracts * okxCtVal;
  const factor = Math.pow(10, quantityPrecision);
  const rounded = Math.floor(ethAmount * factor) / factor;
  return rounded.toFixed(quantityPrecision);
}
