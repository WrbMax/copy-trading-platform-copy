/**
 * Bybit USDT Perpetual contract REST client (v5 API).
 */
import crypto from "crypto";

export interface BybitCredentials {
  apiKey: string;
  secretKey: string;
}

const BASE_URL = "https://api.bybit.com";
const RECV_WINDOW = "5000";

function sign(apiKey: string, secretKey: string, timestamp: string, payload: string): string {
  const msg = timestamp + apiKey + RECV_WINDOW + payload;
  return crypto.createHmac("sha256", secretKey).update(msg).digest("hex");
}

async function bybitRequest<T>(
  creds: BybitCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const timestamp = Date.now().toString();

  let url = `${BASE_URL}${path}`;
  let body = "";
  let signPayload = "";

  if (method === "GET") {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    signPayload = qs;
    if (qs) url += `?${qs}`;
  } else {
    body = JSON.stringify(params);
    signPayload = body;
  }

  const signature = sign(creds.apiKey, creds.secretKey, timestamp, signPayload);

  const res = await fetch(url, {
    method,
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? body : undefined,
  });

  const data = (await res.json()) as { retCode: number; retMsg: string; result: T };
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error ${data.retCode}: ${data.retMsg}`);
  }
  return data.result;
}

/** Convert OKX instId (ETH-USDT-SWAP) to Bybit symbol (ETHUSDT) */
export function toBybitSymbol(instId: string): string {
  const parts = instId.split("-");
  return parts.length >= 2 ? parts[0] + parts[1] : instId.replace(/-/g, "");
}

export interface BybitOrderResult {
  orderId: string;
  orderLinkId: string;
}

/**
 * Place a Bybit linear (USDT) perpetual order.
 * side: "Buy" | "Sell"
 * positionIdx: 1=long hedge, 2=short hedge, 0=one-way
 */
export async function placeBybitOrder(
  creds: BybitCredentials,
  instId: string,
  side: "Buy" | "Sell",
  positionSide: "LONG" | "SHORT",
  quantity: string
): Promise<BybitOrderResult> {
  const symbol = toBybitSymbol(instId);
  // positionIdx: 1 = Buy/Long hedge mode, 2 = Sell/Short hedge mode
  const positionIdx = positionSide === "LONG" ? 1 : 2;

  return bybitRequest<BybitOrderResult>(creds, "POST", "/v5/order/create", {
    category: "linear",
    symbol,
    side,
    orderType: "Market",
    qty: quantity,
    positionIdx,
  });
}

/** Close a Bybit position (reduce-only) */
export async function closeBybitPosition(
  creds: BybitCredentials,
  instId: string,
  positionSide: "LONG" | "SHORT",
  quantity: string
): Promise<BybitOrderResult> {
  const side = positionSide === "LONG" ? "Sell" : "Buy";
  const symbol = toBybitSymbol(instId);
  const positionIdx = positionSide === "LONG" ? 1 : 2;

  return bybitRequest<BybitOrderResult>(creds, "POST", "/v5/order/create", {
    category: "linear",
    symbol,
    side,
    orderType: "Market",
    qty: quantity,
    positionIdx,
    reduceOnly: true,
  });
}

/** Query a specific Bybit order to get fill details.
 * First tries active orders (/v5/order/realtime), then falls back to history (/v5/order/history).
 */
export async function getBybitOrderDetail(
  creds: BybitCredentials,
  symbol: string,
  orderId: string
): Promise<{ avgPrice: string; cumExecQty: string; cumExecFee: string; status: string; profit: string }> {
  type OrderItem = { avgPrice: string; cumExecQty: string; cumExecFee: string; orderStatus: string };

  // Try active orders first
  let order: OrderItem | undefined;
  try {
    const data = await bybitRequest<{ list: Array<OrderItem> }>(
      creds, "GET", "/v5/order/realtime", { category: "linear", symbol, orderId }
    );
    order = data.list?.[0];
  } catch {
    // ignore, will try history
  }

  // If not found in active orders, query history
  if (!order || !order.avgPrice || order.avgPrice === "0") {
    try {
      const data = await bybitRequest<{ list: Array<OrderItem> }>(
        creds, "GET", "/v5/order/history", { category: "linear", symbol, orderId }
      );
      order = data.list?.[0];
    } catch {
      // ignore
    }
  }

  return {
    avgPrice: order?.avgPrice || "0",
    cumExecQty: order?.cumExecQty || "0",
    cumExecFee: order?.cumExecFee || "0",
    status: order?.orderStatus || "UNKNOWN",
    profit: "0", // Bybit order API doesn't return PnL; use getBybitClosedPnl instead
  };
}

/**
 * Query Bybit closed PnL for a specific order.
 * Calls /v5/position/closed-pnl which returns realized PnL per closing trade.
 * Returns the closedPnl value matching the given orderId, or 0 if not found.
 */
export async function getBybitClosedPnl(
  creds: BybitCredentials,
  symbol: string,
  orderId: string
): Promise<number> {
  try {
    type PnlItem = { orderId: string; closedPnl: string; cumEntryValue: string; cumExitValue: string };
    // Fetch recent closed PnL records (last 50 should cover the order)
    const data = await bybitRequest<{ list: Array<PnlItem> }>(
      creds, "GET", "/v5/position/closed-pnl",
      { category: "linear", symbol, limit: 50 }
    );
    const record = data.list?.find((r) => r.orderId === orderId);
    if (record) {
      return parseFloat(record.closedPnl) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Get Bybit instrument info for quantity precision */
export async function getBybitInstrument(
  symbol: string
): Promise<{ qtyStep: string; minOrderQty: string } | null> {
  try {
    const data = await fetch(
      `${BASE_URL}/v5/market/instruments-info?category=linear&symbol=${symbol}`
    ).then((r) => r.json()) as {
      result: { list: Array<{ lotSizeFilter: { qtyStep: string; minOrderQty: string } }> };
    };
    const item = data.result?.list?.[0];
    if (!item) return null;
    return {
      qtyStep: item.lotSizeFilter.qtyStep,
      minOrderQty: item.lotSizeFilter.minOrderQty,
    };
  } catch {
    return null;
  }
}
