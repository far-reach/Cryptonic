import type { FetchLike } from "../../types.js";
import { hmacHex, numStr } from "../signing.js";
import type { Balance, ClientOptions, Credentials, ExchangeClient, OrderRequest, OrderResult, SignedRequest, SymbolRules } from "../types.js";
import { defaultFetch, num, rec, send } from "./common.js";

const API = "https://api.binance.com";

/** Binance: signature = HMAC-SHA256 hex(secret, queryString) appended as `signature=`; header X-MBX-APIKEY. */
export function signBinance(creds: Credentials, method: "GET" | "POST", path: string, params: Record<string, string>, nowMs: number, apiBase = API): SignedRequest {
  const qs = new URLSearchParams({ ...params, timestamp: String(nowMs), recvWindow: "5000" }).toString();
  const signature = hmacHex(creds.apiSecret, qs);
  return {
    method,
    url: `${apiBase}${path}?${qs}&signature=${signature}`,
    headers: { "X-MBX-APIKEY": creds.apiKey },
  };
}

const toResult = (row: Record<string, unknown>): OrderResult => {
  const filledBase = num(row.executedQty);
  const filledQuote = num(row.cummulativeQuoteQty);
  const status = String(row.status ?? "");
  const fills = Array.isArray(row.fills) ? row.fills.map(rec) : [];
  const quoteAsset = String(row.symbol ?? "").slice(-4);
  const feeQuote = fills.length && fills.every((f) => String(f.commissionAsset) === quoteAsset) ? fills.reduce((a, f) => a + num(f.commission), 0) : undefined;
  return {
    venue: "binance",
    orderId: String(row.orderId ?? ""),
    status: status === "FILLED" ? "filled" : filledBase > 0 ? "partial" : status === "EXPIRED" || status === "CANCELED" ? "cancelled" : status === "REJECTED" ? "rejected" : "unknown",
    filledBase,
    filledQuote,
    avgPrice: filledBase > 0 ? filledQuote / filledBase : 0,
    feeQuote,
    raw: row,
  };
};

export function binanceClient(creds: Credentials, opts: ClientOptions = {}): ExchangeClient {
  const fetchFn: FetchLike = opts.fetchFn ?? defaultFetch();
  const apiBase = opts.apiBase ?? API;
  const now = opts.now ?? Date.now;
  const symbol = (b: string, q: string) => `${b}${q}`;
  return {
    venue: "binance",
    signPlaceOrder(req, nowMs) {
      return signBinance(
        creds,
        "POST",
        "/api/v3/order",
        {
          symbol: symbol(req.base, req.quote),
          side: req.side.toUpperCase(),
          type: "LIMIT",
          timeInForce: "IOC",
          quantity: numStr(req.amountBase),
          price: numStr(req.price),
          newClientOrderId: req.clientOrderId,
          newOrderRespType: "FULL",
        },
        nowMs,
        apiBase,
      );
    },
    async placeOrder(req) {
      const json = await send(fetchFn, this.signPlaceOrder(req, now()), "binance place");
      return toResult(rec(json));
    },
    async getOrder(req, orderId) {
      const json = await send(fetchFn, signBinance(creds, "GET", "/api/v3/order", { symbol: symbol(req.base, req.quote), orderId }, now(), apiBase), "binance order");
      return toResult(rec(json));
    },
    async getBalance(asset) {
      const json = rec(await send(fetchFn, signBinance(creds, "GET", "/api/v3/account", { omitZeroBalances: "true" }, now(), apiBase), "binance account"));
      const row = Array.isArray(json.balances) ? rec(json.balances.find((b) => String(rec(b).asset) === asset)) : {};
      return { asset, available: num(row.free) };
    },
    async getSymbolRules(base, quote) {
      const res = await fetchFn(`${apiBase}/api/v3/exchangeInfo?symbol=${symbol(base, quote)}`);
      const json = rec(JSON.parse(await res.text()));
      const sym = Array.isArray(json.symbols) ? rec(json.symbols[0]) : {};
      const filters = Array.isArray(sym.filters) ? sym.filters.map(rec) : [];
      const f = (t: string) => filters.find((x) => x.filterType === t) ?? {};
      return { lotStep: num(f("LOT_SIZE").stepSize), tickSize: num(f("PRICE_FILTER").tickSize), minNotional: num(f("NOTIONAL").minNotional) };
    },
  };
}
