/**
 * Gate.io USDT Perpetual contract REST client (v4 API).
 */
import crypto from "crypto";

export interface GateCredentials {
  apiKey: string;
  secretKey: string;
}

const BASE_URL = "https://api.gateio.ws";

function sign(
  secretKey: string,
  method: string,
  path: string,
  queryString: string,
  body: string,
  timestamp: string
): string {
  const hashedBody = crypto.createHash("sha512").update(body || "").digest("hex");
  const msg = `${method}\n${path}\n${queryString}\n${hashedBody}\n${timestamp}`;
  return crypto.createHmac("sha512", secretKey).update(msg).digest("hex");
}

async function gateRequest<T>(
  creds: GateCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let url = `${BASE_URL}${path}`;
  let body = "";
  let queryString = "";

  if (method === "GET") {
    queryString = new URLSearchParams(params as Record<string, string>).toString();
    if (queryString) url += `?${queryString}`;
  } else {
    body = JSON.stringify(params);
  }

  const signature = sign(creds.secretKey, method, path, queryString, body, timestamp);

  const res = await fetch(url, {
    method,
    headers: {
      "KEY": creds.apiKey,
      "SIGN": signature,
      "Timestamp": timestamp,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: method === "POST" ? body : undefined,
  });

  const data = await res.json() as T & { label?: string; message?: string };
  if ((data as { label?: string }).label) {
    throw new Error(`Gate.io API error ${(data as { label?: string }).label}: ${(data as { message?: string }).message}`);
  }
  return data;
}

/** Convert OKX instId (ETH-USDT-SWAP) to Gate.io contract (ETH_USDT) */
export function toGateContract(instId: string): string {
  const parts = instId.split("-");
  return parts.length >= 2 ? `${parts[0]}_${parts[1]}` : instId.replace(/-/g, "_");
}

export interface GateOrderResult {
  id: number;
  contract: string;
  size: number;
  price: string;
  status: string;
}

/**
 * Place a Gate.io USDT perpetual order.
 * size > 0 = long/buy, size < 0 = short/sell
 * For close: set reduce_only = true
 */
export async function placeGateOrder(
  creds: GateCredentials,
  instId: string,
  size: number, // positive = long, negative = short
  reduceOnly = false
): Promise<GateOrderResult> {
  const contract = toGateContract(instId);
  return gateRequest<GateOrderResult>(creds, "POST", "/api/v4/futures/usdt/orders", {
    contract,
    size,
    price: "0", // market order
    tif: "ioc",
    reduce_only: reduceOnly,
  });
}

/** Open long: positive size */
export async function openGateLong(creds: GateCredentials, instId: string, qty: number): Promise<GateOrderResult> {
  return placeGateOrder(creds, instId, qty);
}

/** Open short: negative size */
export async function openGateShort(creds: GateCredentials, instId: string, qty: number): Promise<GateOrderResult> {
  return placeGateOrder(creds, instId, -qty);
}

/** Close long: negative size + reduce_only */
export async function closeGateLong(creds: GateCredentials, instId: string, qty: number): Promise<GateOrderResult> {
  return placeGateOrder(creds, instId, -qty, true);
}

/** Close short: positive size + reduce_only */
export async function closeGateShort(creds: GateCredentials, instId: string, qty: number): Promise<GateOrderResult> {
  return placeGateOrder(creds, instId, qty, true);
}

/** Query a specific Gate.io order to get fill details */
export async function getGateOrderDetail(
  creds: GateCredentials,
  orderId: string
): Promise<{ fillPrice: string; size: number; fee: string; pnl: string; status: string }> {
  const data = await gateRequest<{ fill_price: string; size: number; fee: string; pnl: string; status: string }>(
    creds, "GET", `/api/v4/futures/usdt/orders/${orderId}`
  );
  return {
    fillPrice: data?.fill_price || "0",
    size: data?.size || 0,
    fee: data?.fee || "0",
    pnl: data?.pnl || "0",
    status: data?.status || "unknown",
  };
}

/** Get Gate.io contract info */
export async function getGateInstrument(
  contract: string
): Promise<{ quanto_multiplier: string; order_size_min: number } | null> {
  try {
    const data = await fetch(
      `${BASE_URL}/api/v4/futures/usdt/contracts/${contract}`
    ).then((r) => r.json()) as { quanto_multiplier: string; order_size_min: number };
    return data;
  } catch {
    return null;
  }
}
