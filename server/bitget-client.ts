/**
 * Bitget USDT-M Perpetual contract REST client (v2 API).
 */
import crypto from "crypto";

export interface BitgetCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

const BASE_URL = "https://api.bitget.com";

function sign(secretKey: string, timestamp: string, method: string, requestPath: string, body = ""): string {
  const msg = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac("sha256", secretKey).update(msg).digest("base64");
}

async function bitgetRequest<T>(
  creds: BitgetCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const timestamp = Date.now().toString();
  let url = `${BASE_URL}${path}`;
  let body = "";
  let signPath = path;

  if (method === "GET") {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    if (qs) {
      url += `?${qs}`;
      signPath += `?${qs}`;
    }
  } else {
    body = JSON.stringify(params);
  }

  const signature = sign(creds.secretKey, timestamp, method, signPath, body);

  const res = await fetch(url, {
    method,
    headers: {
      "ACCESS-KEY": creds.apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": creds.passphrase,
      "Content-Type": "application/json",
      "locale": "en-US",
    },
    body: method === "POST" ? body : undefined,
  });

  const data = (await res.json()) as { code: string; msg: string; data: T };
  if (data.code !== "00000") {
    throw new Error(`Bitget API error ${data.code}: ${data.msg}`);
  }
  return data.data;
}

/** Convert OKX instId (ETH-USDT-SWAP) to Bitget symbol (ETHUSDT) */
export function toBitgetSymbol(instId: string): string {
  const parts = instId.split("-");
  return parts.length >= 2 ? parts[0] + parts[1] : instId.replace(/-/g, "");
}

export interface BitgetOrderResult {
  orderId: string;
  clientOid: string;
}

/** Query a specific Bitget order to get fill details */
export async function getBitgetOrderDetail(
  creds: BitgetCredentials,
  symbol: string,
  orderId: string
): Promise<{ avgPrice: string; filledQty: string; fee: string; profit: string; status: string }> {
  const productType = "USDT-FUTURES";
  const data = await bitgetRequest<Array<{ priceAvg: string; baseVolume: string; fee: string; profit: string; state: string }>>(
    creds, "GET", "/api/v2/mix/order/detail", { symbol, orderId, productType }
  );
  const order = Array.isArray(data) ? data[0] : (data as any);
  return {
    avgPrice: order?.priceAvg || "0",
    filledQty: order?.baseVolume || "0",
    fee: order?.fee || "0",
    profit: order?.profit || "0",
    status: order?.state || "unknown",
  };
}

/**
 * Place a Bitget USDT perpetual order.
 * side: "open_long" | "open_short" | "close_long" | "close_short"
 */
export async function placeBitgetOrder(
  creds: BitgetCredentials,
  instId: string,
  side: "open_long" | "open_short" | "close_long" | "close_short",
  quantity: string
): Promise<BitgetOrderResult> {
  const symbol = toBitgetSymbol(instId);
  // tradeSide must match: "open" for opening, "close" for closing
  const tradeSide = side.startsWith("close") ? "close" : "open";
  return bitgetRequest<BitgetOrderResult>(creds, "POST", "/api/v2/mix/order/place-order", {
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "crossed",
    marginCoin: "USDT",
    size: quantity,
    side,
    orderType: "market",
    tradeSide,
  });
}

/** Open long position */
export async function openBitgetLong(creds: BitgetCredentials, instId: string, qty: string): Promise<BitgetOrderResult> {
  return placeBitgetOrder(creds, instId, "open_long", qty);
}

/** Open short position */
export async function openBitgetShort(creds: BitgetCredentials, instId: string, qty: string): Promise<BitgetOrderResult> {
  return placeBitgetOrder(creds, instId, "open_short", qty);
}

/** Close long position */
export async function closeBitgetLong(creds: BitgetCredentials, instId: string, qty: string): Promise<BitgetOrderResult> {
  return placeBitgetOrder(creds, instId, "close_long", qty);
}

/** Close short position */
export async function closeBitgetShort(creds: BitgetCredentials, instId: string, qty: string): Promise<BitgetOrderResult> {
  return placeBitgetOrder(creds, instId, "close_short", qty);
}

/** Get Bitget instrument info */
export async function getBitgetInstrument(
  symbol: string
): Promise<{ sizeMultiplier: string; minTradeNum: string } | null> {
  try {
    const data = await fetch(
      `${BASE_URL}/api/v2/mix/market/contracts?productType=USDT-FUTURES&symbol=${symbol}`
    ).then((r) => r.json()) as {
      data: Array<{ sizeMultiplier: string; minTradeNum: string }>;
    };
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get Bitget USDT futures account balance.
 * Uses /api/v2/mix/account/accounts with productType=USDT-FUTURES.
 */
export async function getBitgetBalance(
  creds: BitgetCredentials
): Promise<{ totalWalletBalance: string; availableBalance: string }> {
  const data = await bitgetRequest<Array<{
    marginCoin: string;
    equity: string;
    available: string;
  }>>(creds, "GET", "/api/v2/mix/account/accounts", { productType: "USDT-FUTURES" });
  const usdt = Array.isArray(data)
    ? data.find((a) => a.marginCoin === "USDT")
    : undefined;
  return {
    totalWalletBalance: usdt?.equity || "0",
    availableBalance: usdt?.available || "0",
  };
}
