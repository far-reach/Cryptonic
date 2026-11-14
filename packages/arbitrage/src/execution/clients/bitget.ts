import type { FetchLike } from "../../types.js";
import { hmacBase64, numStr } from "../signing.js";
import type { Balance, ClientOptions, Credentials, ExchangeClient, OrderRequest, OrderResult, SignedRequest, SymbolRules } from "../types.js";
import { defaultFetch, num, rec, send } from "./common.js";

const API = "https://api.bitget.com";

/** Bitget v2: ACCESS-SIGN = base64(HMAC-SHA256(secret, timestamp + METHOD + requestPath(+query) + body)). */
export function signBitget(creds: Credentials, method: "GET" | "POST", path: string, body: string, nowMs: number, apiBase = API): SignedRequest {
  const ts = String(nowMs);
  const sign = hmacBase64(creds.apiSecret, `${ts}${method}${path}${body}`);
  return {
    method,
    url: `${apiBase}${path}`,
    headers: {
      "ACCESS-KEY": creds.apiKey,
      "ACCESS-SIGN": sign,
      "ACCESS-TIMESTAMP": ts,
      "ACCESS-PASSPHRASE": creds.passphrase ?? "",
      "Content-Type": "application/json",
      locale: "en-US",
    },
    body: body || undefined,
  };
}

function unwrap(json: unknown, label: string): unknown {
  const r = rec(json);
  if (r.code !== "00000") throw new Error(`${label}: Bitget ${r.code}: ${r.msg}`);
  return r.data;
}

const toResult = (row: Record<string, unknown>, orderId: string): OrderResult => {
  const filledBase = num(row.baseVolume);
  const filledQuote = num(row.quoteVolume);
  const status = String(row.status ?? "");
  const feeQuote = Array.isArray(row.feeDetail) ? undefined : undefined;
  return {
    venue: "bitget",
    orderId,
    status: status === "filled" ? "filled" : status === "partially_filled" ? "partial" : status === "cancelled" ? (filledBase > 0 ? "partial" : "cancelled") : "unknown",
    filledBase,
    filledQuote,
    avgPrice: filledBase > 0 ? filledQuote / filledBase : 0,
    feeQuote,
    raw: row,
  };
};

export function bitgetClient(creds: Credentials, opts: ClientOptions = {}): ExchangeClient {
  const fetchFn: FetchLike = opts.fetchFn ?? defaultFetch();
  const apiBase = opts.apiBase ?? API;
  const now = opts.now ?? Date.now;
  const symbol = (b: string, q: string) => `${b}${q}`;
  return {
    venue: "bitget",
    signPlaceOrder(req, nowMs) {
      const body = JSON.stringify({
        symbol: symbol(req.base, req.quote),
        side: req.side,
        orderType: "limit",
        force: "ioc",
        price: numStr(req.price),
        size: numStr(req.amountBase),
        clientOid: req.clientOrderId,
      });
      return signBitget(creds, "POST", "/api/v2/spot/trade/place-order", body, nowMs, apiBase);
    },
    async placeOrder(req) {
      const data = rec(unwrap(await send(fetchFn, this.signPlaceOrder(req, now()), "bitget place"), "bitget place"));
      const orderId = String(data.orderId ?? "");
      return this.getOrder(req, orderId);
    },
    async getOrder(_req, orderId) {
      const path = `/api/v2/spot/trade/orderInfo?orderId=${encodeURIComponent(orderId)}`;
      const data = unwrap(await send(fetchFn, signBitget(creds, "GET", path, "", now(), apiBase), "bitget order"), "bitget order");
      const row = Array.isArray(data) ? rec(data[0]) : rec(data);
      return toResult(row, orderId);
    },
    async getBalance(asset) {
      const path = `/api/v2/spot/account/assets?coin=${encodeURIComponent(asset)}`;
      const data = unwrap(await send(fetchFn, signBitget(creds, "GET", path, "", now(), apiBase), "bitget assets"), "bitget assets");
      const row = Array.isArray(data) ? rec(data.find((d) => String(rec(d).coin).toUpperCase() === asset.toUpperCase())) : {};
      return { asset, available: num(row.available) };
    },
    async getSymbolRules(base, quote) {
      const res = await fetchFn(`${apiBase}/api/v2/spot/public/symbols?symbol=${symbol(base, quote)}`);
      const data = unwrap(JSON.parse(await res.text()), "bitget symbols");
      const row = Array.isArray(data) ? rec(data[0]) : {};
      const qp = num(row.quantityPrecision);
      const pp = num(row.pricePrecision);
      return { lotStep: 10 ** -qp, tickSize: 10 ** -pp, minNotional: num(row.minTradeUSDT) };
    },
  };
}
