/**
 * OKX REST API Client
 * Handles authentication, order placement, position queries for copy trading.
 */
import crypto from "crypto";
import https from "https";

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxPosition {
  instId: string;       // e.g. "ETH-USDT-SWAP"
  posSide: "long" | "short" | "net";
  pos: string;          // number of contracts
  avgPx: string;        // average open price
  upl: string;          // unrealized PnL
  lever: string;        // leverage
  margin: string;
  instType: string;
}

export interface OkxOrderResult {
  ordId: string;
  clOrdId: string;
  sCode: string;
  sMsg: string;
}

function sign(secretKey: string, timestamp: string, method: string, requestPath: string, body = ""): string {
  const message = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

async function okxRequest<T>(
  creds: OkxCredentials,
  method: "GET" | "POST",
  path: string,
  body?: object
): Promise<{ code: string; msg: string; data: T }> {
  const ts = getTimestamp();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sig = sign(creds.secretKey, ts, method, path, bodyStr);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sig,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.okx.com",
      path,
      method,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** Get all open positions for the account */
export async function getPositions(creds: OkxCredentials, instId?: string): Promise<OkxPosition[]> {
  const path = instId
    ? `/api/v5/account/positions?instType=SWAP&instId=${instId}`
    : "/api/v5/account/positions?instType=SWAP";
  const res = await okxRequest<OkxPosition[]>(creds, "GET", path);
  if (res.code !== "0") throw new Error(`OKX getPositions error: ${res.code} ${res.msg}`);
  return res.data || [];
}

/** Get account balance */
export async function getBalance(creds: OkxCredentials): Promise<{ totalEq: string; availBal: string }> {
  const res = await okxRequest<any[]>(creds, "GET", "/api/v5/account/balance");
  if (res.code !== "0") throw new Error(`OKX getBalance error: ${res.code} ${res.msg}`);
  const detail = res.data?.[0] || {};
  const usdtDetail = (detail.details || []).find((d: any) => d.ccy === "USDT") || {};
  return {
    totalEq: detail.totalEq || "0",
    availBal: usdtDetail.availBal || "0",
  };
}

/**
 * Place a futures order
 * @param side  "buy" | "sell"
 * @param posSide "long" | "short"  (for hedge mode)
 * @param sz    number of contracts (integer string)
 * @param ordType "market" | "limit"
 * @param px    price (only for limit orders)
 */
export async function placeOrder(
  creds: OkxCredentials,
  instId: string,
  side: "buy" | "sell",
  posSide: "long" | "short",
  sz: string,
  ordType: "market" | "limit" = "market",
  px?: string
): Promise<OkxOrderResult> {
  const body: Record<string, string> = {
    instId,
    tdMode: "cross",   // cross margin
    side,
    posSide,
    ordType,
    sz,
  };
  if (ordType === "limit" && px) body.px = px;

  const res = await okxRequest<OkxOrderResult[]>(creds, "POST", "/api/v5/trade/order", body);
  if (res.code !== "0") throw new Error(`OKX placeOrder error: ${res.code} ${res.msg}`);
  const result = res.data?.[0];
  if (!result) throw new Error("OKX placeOrder: no result returned");
  if (result.sCode !== "0") throw new Error(`OKX placeOrder rejected: ${result.sCode} ${result.sMsg}`);
  return result;
}

/**
 * Close a position fully (market order)
 * For long position: sell; for short position: buy
 */
export async function closePosition(
  creds: OkxCredentials,
  instId: string,
  posSide: "long" | "short",
  sz: string
): Promise<OkxOrderResult> {
  const side = posSide === "long" ? "sell" : "buy";
  return placeOrder(creds, instId, side, posSide, sz, "market");
}

/**
 * Query a specific OKX order to get fill details.
 */
export async function getOkxOrderDetail(
  creds: OkxCredentials,
  instId: string,
  ordId: string
): Promise<{ avgPx: string; fillSz: string; fee: string; pnl: string; state: string }> {
  const path = `/api/v5/trade/order?instId=${instId}&ordId=${ordId}`;
  const res = await okxRequest<Array<{ avgPx: string; fillSz: string; fee: string; pnl: string; state: string }>>(
    creds, "GET", path
  );
  const order = res.data?.[0];
  return {
    avgPx: order?.avgPx || "0",
    fillSz: order?.fillSz || "0",
    fee: order?.fee || "0",
    pnl: order?.pnl || "0",
    state: order?.state || "unknown",
  };
}

/**
 * Get instrument info (lot size, min size etc.)
 */
// Cache instrument info for 5 minutes to avoid repeated API calls
const instrumentCache = new Map<string, { data: { ctVal: string; minSz: string; lotSz: string }; expiry: number }>();

export async function getInstrument(instId: string): Promise<{ ctVal: string; minSz: string; lotSz: string } | null> {
  const cached = instrumentCache.get(instId);
  if (cached && Date.now() < cached.expiry) return cached.data;

  return new Promise((resolve) => {
    const path = `/api/v5/public/instruments?instType=SWAP&instId=${instId}`;
    https.get(`https://www.okx.com${path}`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const inst = json.data?.[0];
          if (!inst) return resolve(null);
          const result = { ctVal: inst.ctVal, minSz: inst.minSz, lotSz: inst.lotSz };
          instrumentCache.set(instId, { data: result, expiry: Date.now() + 5 * 60 * 1000 });
          resolve(result);
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

/**
 * Calculate number of contracts from USDT amount
 * ctVal = contract value in base currency (e.g. 0.01 ETH per contract)
 * sz = floor(usdtAmount / (price * ctVal))
 */
export function calcContractSize(usdtAmount: number, price: number, ctVal: number, minSz = 1): number {
  const sz = Math.floor(usdtAmount / (price * ctVal));
  return Math.max(sz, minSz);
}

/**
 * Comprehensive OKX API test:
 * 1. Verify API key, secret, and passphrase validity
 * 2. Check account configuration (position mode must be long_short_mode)
 * Returns { success, message, checks } with detailed per-check results.
 */
export async function testOkxApi(creds: OkxCredentials): Promise<{
  success: boolean;
  message: string;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}> {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // ── Check 1: API Key + Passphrase validity (account balance query) ──
  let accountOk = false;
  try {
    const res = await okxRequest<any[]>(creds, "GET", "/api/v5/account/balance");
    if (res.code !== "0") {
      let detail = `API验证失败：${res.msg}`;
      if (res.msg?.includes("50105") || res.code === "50105") detail = "Passphrase 错误，请检查API口令是否与OKX设置一致";
      else if (res.msg?.includes("50111") || res.code === "50111") detail = "API Key 无效或已过期，请重新生成";
      else if (res.msg?.includes("50113") || res.code === "50113") detail = "IP不在白名单，请在OKX将服务器IP加入白名单";
      else if (res.msg?.includes("50119") || res.code === "50119") detail = "API Key 权限不足，请开启合约交易权限";
      checks.push({ name: "API密钥与Passphrase", passed: false, detail });
      return { success: false, message: detail, checks };
    }
    accountOk = true;
    checks.push({ name: "API密钥与Passphrase", passed: true, detail: "API Key、Secret、Passphrase 验证通过" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    let detail = `连接失败：${msg}`;
    if (msg.includes("50105")) detail = "Passphrase 错误，请检查API口令是否与OKX设置一致";
    else if (msg.includes("50111")) detail = "API Key 无效或已过期";
    else if (msg.includes("50113")) detail = "IP不在白名单";
    checks.push({ name: "API密钥与Passphrase", passed: false, detail });
    return { success: false, message: detail, checks };
  }

  // ── Check 2: Position mode (must be long_short_mode for copy trading) ──
  if (accountOk) {
    try {
      const res = await okxRequest<Array<{ posMode: string }>>(creds, "GET", "/api/v5/account/config");
      if (res.code !== "0") {
        checks.push({ name: "持仓模式", passed: false, detail: `账户配置查询失败：${res.msg}` });
      } else {
        const posMode = res.data?.[0]?.posMode;
        if (posMode === "long_short_mode") {
          checks.push({ name: "持仓模式", passed: true, detail: "双向持仓模式（买卖模式），符合跟单要求" });
        } else {
          checks.push({
            name: "持仓模式",
            passed: false,
            detail: "当前为单向持仓模式，请在OKX合约页面 → 设置 → 持仓模式，切换为「双向持仓」后重新测试",
          });
        }
      }
    } catch {
      checks.push({ name: "持仓模式", passed: false, detail: "持仓模式查询失败，请确认已开通合约账户" });
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
