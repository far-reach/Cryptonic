import type { FetchLike } from "../../types.js";
import { hmacHex, numStr } from "../signing.js";
import type { Balance, ClientOptions, Credentials, ExchangeClient, OrderRequest, OrderResult, SignedRequest, SymbolRules } from "../types.js";
import { defaultFetch, num, rec, send } from "./common.js";

const API = "https://api.bybit.com";
const RECV = "5000";

/** Bybit v5: X-BAPI-SIGN = HMAC-SHA256 hex(secret, timestamp + apiKey + recvWindow + (body | queryString)). */
export function signBybit(creds: Credentials, method: "GET" | "POST", path: string, payload: string, nowMs: number, apiBase = API): SignedRequest {
  const ts = String(nowMs);
  const sign = hmacHex(creds.apiSecret, `${ts}${creds.apiKey}${RECV}${payload}`);
  return {
    method,
    url: method === "GET" && payload ? `${apiBase}${path}?${payload}` : `${apiBase}${path}`,
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV,
      "X-BAPI-SIGN": sign,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? payload : undefined,
  };
}

function unwrap(json: unknown, label: string): Record<string, unknown> {
  const r = rec(json);
  if (r.retCode !== 0) throw new Error(`${label}: Bybit ${r.retCode}: ${r.retMsg}`);
  return rec(r.result);
}

const toResult = (row: Record<string, unknown>): OrderResult => {
  const filledBase = num(row.cumExecQty);
  const filledQuote = num(row.cumExecValue);
  const status = String(row.orderStatus ?? "");
  return {
    venue: "bybit",
    orderId: String(row.orderId ?? ""),
    status: status === "Filled" ? "filled" : filledBase > 0 ? "partial" : /Cancel|Rejected/.test(status) ? (status === "Rejected" ? "rejected" : "cancelled") : "unknown",
    filledBase,
    filledQuote,
    avgPrice: filledBase > 0 ? filledQuote / filledBase : 0,
    feeQuote: num(row.cumExecFee) || undefined,
    raw: row,
  };
};

export function bybitClient(creds: Credentials, opts: ClientOptions = {}): ExchangeClient {
  const fetchFn: FetchLike = opts.fetchFn ?? defaultFetch();
  const apiBase = opts.apiBase ?? API;
  const now = opts.now ?? Date.now;
  const symbol = (b: string, q: string) => `${b}${q}`;
  return {
    venue: "bybit",
    signPlaceOrder(req, nowMs) {
      const body = JSON.stringify({
        category: "spot",
        symbol: symbol(req.base, req.quote),
        side: req.side === "buy" ? "Buy" : "Sell",
        orderType: "Limit",
        qty: numStr(req.amountBase),
        price: numStr(req.price),
        timeInForce: "IOC",
        orderLinkId: req.clientOrderId,
      });
      return signBybit(creds, "POST", "/v5/order/create", body, nowMs, apiBase);
    },
    async placeOrder(req) {
      const result = unwrap(await send(fetchFn, this.signPlaceOrder(req, now()), "bybit place"), "bybit place");
      return this.getOrder(req, String(result.orderId ?? ""));
    },
    async getOrder(req, orderId) {
      const qs = `category=spot&symbol=${symbol(req.base, req.quote)}&orderId=${orderId}`;
      let result = unwrap(await send(fetchFn, signBybit(creds, "GET", "/v5/order/realtime", qs, now(), apiBase), "bybit order"), "bybit order");
      let list = Array.isArray(result.list) ? result.list : [];
      if (!list.length) {
        // IOC orders leave the realtime book immediately; fall back to history.
        result = unwrap(await send(fetchFn, signBybit(creds, "GET", "/v5/order/history", qs, now(), apiBase), "bybit history"), "bybit history");
        list = Array.isArray(result.list) ? result.list : [];
      }
      return toResult(rec(list[0]));
    },
    async getBalance(asset) {
      const qs = `accountType=UNIFIED&coin=${asset}`;
      const result = unwrap(await send(fetchFn, signBybit(creds, "GET", "/v5/account/wallet-balance", qs, now(), apiBase), "bybit balance"), "bybit balance");
      const acct = Array.isArray(result.list) ? rec(result.list[0]) : {};
      const coin = Array.isArray(acct.coin) ? rec(acct.coin.find((c) => String(rec(c).coin) === asset)) : {};
      const available = num(coin.availableToWithdraw) || num(coin.walletBalance) - num(coin.locked);
      return { asset, available };
    },
    async getSymbolRules(base, quote) {
      const res = await fetchFn(`${apiBase}/v5/market/instruments-info?category=spot&symbol=${symbol(base, quote)}`);
      const result = unwrap(JSON.parse(await res.text()), "bybit instruments");
      const row = Array.isArray(result.list) ? rec(result.list[0]) : {};
      const lot = rec(row.lotSizeFilter);
      const price = rec(row.priceFilter);
      return { lotStep: num(lot.basePrecision), tickSize: num(price.tickSize), minNotional: num(lot.minOrderAmt) };
    },
  };
}
