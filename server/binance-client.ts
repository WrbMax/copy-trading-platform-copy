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

  // Use text() + regex to preserve big integer orderId precision (JS Number loses precision for > 2^53)
  const text = await res.text();
  // Convert large numeric orderId values to strings before JSON.parse
  const safeText = text.replace(/"orderId"\s*:\s*(\d{15,})/g, '"orderId":"$1"');
  const data = JSON.parse(safeText) as T & { code?: number; msg?: string };
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
  orderId: string;
  symbol: string;
  status: string;
  side: string;
  positionSide: string;
  origQty: string;
  avgPrice: string;
}

/**
 * Comprehensive Binance API test:
 * 1. Verify API key validity and futures trading permission
 * 2. Check position mode (must be hedge/dual-side for copy trading)
 * Returns { success, message, checks } with detailed per-check results.
 */
export async function testBinanceApi(creds: BinanceCredentials): Promise<{
  success: boolean;
  message: string;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}> {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // ── Check 1: API Key validity & futures permission ──
  let accountOk = false;
  try {
    await binanceRequest<object>(creds, "GET", "/fapi/v2/account", {});
    accountOk = true;
    checks.push({ name: "API密钥有效性", passed: true, detail: "API Key 验证通过，合约账户可访问" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    let detail = "API Key 无效或已过期，请重新生成";
    if (msg.includes("-2015")) detail = "API Key 无效、IP未在白名单，或未开启合约交易权限";
    else if (msg.includes("-1022")) detail = "Secret Key 错误，签名验证失败";
    else if (msg.includes("-1100") || msg.includes("-1102")) detail = "请求参数错误";
    checks.push({ name: "API密钥有效性", passed: false, detail });
    return {
      success: false,
      message: `验证失败：${detail}`,
      checks,
    };
  }

  // ── Check 2: Position mode (must be hedge/dual-side) ──
  if (accountOk) {
    try {
      const data = await binanceRequest<{ dualSidePosition: boolean }>(creds, "GET", "/fapi/v1/positionSide/dual", {});
      if (data.dualSidePosition === true) {
        checks.push({ name: "持仓模式", passed: true, detail: "双向持仓模式（对冲模式），符合跟单要求" });
      } else {
        checks.push({
          name: "持仓模式",
          passed: false,
          detail: "当前为单向持仓模式，请在币安合约页面 → 设置 → 持仓模式，切换为「双向持仓」后重新测试",
        });
      }
    } catch {
      checks.push({ name: "持仓模式", passed: false, detail: "持仓模式查询失败，请确认合约账户已开通" });
    }
  }

  const allPassed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed);

  if (allPassed) {
    return { success: true, message: "连接成功，所有检测项通过", checks };
  } else {
    const summary = failedChecks.map((c) => c.detail).join("；");
    return { success: false, message: summary, checks };
  }
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
 * Directly queries /fapi/v1/userTrades which returns both commission AND realizedPnl.
 * Avoids /fapi/v1/order which:
 *   1. Does NOT return realizedPnl for futures orders
 *   2. Returns -2013 "Order does not exist" for reduceOnly/close orders in some cases
 */
export async function getBinanceOrderDetail(
  creds: BinanceCredentials,
  symbol: string,
  orderId: string
): Promise<{ avgPrice: string; executedQty: string; realizedPnl: string; commission: string; status: string }> {
  // Retry up to 3 times with increasing delays to handle settlement lag
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const trades = await binanceRequest<Array<{ price: string; qty: string; commission: string; commissionAsset: string; realizedPnl: string }>>(
        creds, "GET", "/fapi/v1/userTrades", { symbol, orderId, limit: 50 }
      );

      if (trades && trades.length > 0) {
        // Calculate weighted average price from all fills
        const totalQty = trades.reduce((sum, t) => sum + parseFloat(t.qty || "0"), 0);
        const avgPrice = totalQty > 0
          ? (trades.reduce((sum, t) => sum + parseFloat(t.price || "0") * parseFloat(t.qty || "0"), 0) / totalQty).toFixed(8)
          : "0";

        const commission = trades
          .filter(t => t.commissionAsset === "USDT")
          .reduce((sum, t) => sum + parseFloat(t.commission || "0"), 0)
          .toFixed(8);

        const realizedPnl = trades
          .reduce((sum, t) => sum + parseFloat(t.realizedPnl || "0"), 0)
          .toFixed(8);

        return {
          avgPrice,
          executedQty: totalQty.toFixed(8),
          realizedPnl,
          commission,
          status: "FILLED",
        };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Binance] getBinanceOrderDetail attempt ${attempt} failed: ${msg}`);
    }

    // Wait before retry: 3s, 5s, 8s
    if (attempt < 3) {
      const delay = attempt === 1 ? 3000 : 5000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error(`Binance API error -2013: Order does not exist.`);
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
  const ethQty = okxContracts * okxCtVal;
  const factor = Math.pow(10, quantityPrecision);
  return (Math.floor(ethQty * factor) / factor).toFixed(quantityPrecision);
}
