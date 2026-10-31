import type { FetchLike } from "../../types.js";
import { hmacBase64, numStr } from "../signing.js";
import type { Balance, ClientOptions, Credentials, ExchangeClient, OrderRequest, OrderResult, SignedRequest, SymbolRules } from "../types.js";
import { defaultFetch, num, rec, send } from "./common.js";

const API = "https://www.okx.com";

/** OKX: OK-ACCESS-SIGN = base64(HMAC-SHA256(secret, isoTimestamp + METHOD + requestPath(+query) + body)). */
export function signOkx(creds: Credentials, method: "GET" | "POST", path: string, body: string, nowMs: number, apiBase = API): SignedRequest {
  const ts = new Date(nowMs).toISOString();
  const sign = hmacBase64(creds.apiSecret, `${ts}${method}${path}${body}`);
  return {
    method,
    url: `${apiBase}${path}`,
    headers: {
      "OK-ACCESS-KEY": creds.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
      "Content-Type": "application/json",
    },
    body: body || undefined,
  };
}

function unwrap(json: unknown, label: string): Record<string, unknown>[] {
  const r = rec(json);
  if (r.code !== "0") throw new Error(`${label}: OKX ${r.code}: ${r.msg}`);
  return Array.isArray(r.data) ? r.data.map(rec) : [];
}

const toResult = (row: Record<string, unknown>): OrderResult => {
  const filledBase = num(row.accFillSz);
  const avg = num(row.avgPx);
  const state = String(row.state ?? "");
  return {
    venue: "okx",
    orderId: String(row.ordId ?? ""),
    status: state === "filled" ? "filled" : filledBase > 0 ? "partial" : state === "canceled" ? "cancelled" : "unknown",
    filledBase,
    filledQuote: filledBase * avg,
    avgPrice: avg,
    feeQuote: String(row.feeCcy ?? "") && String(row.feeCcy) === String(row.instId ?? "").split("-")[1] ? Math.abs(num(row.fee)) : undefined,
    raw: row,
  };
};

export function okxClient(creds: Credentials, opts: ClientOptions = {}): ExchangeClient {
  const fetchFn: FetchLike = opts.fetchFn ?? defaultFetch();
  const apiBase = opts.apiBase ?? API;
  const now = opts.now ?? Date.now;
  const instId = (b: string, q: string) => `${b}-${q}`;
  return {
    venue: "okx",
    signPlaceOrder(req, nowMs) {
      const body = JSON.stringify({
        instId: instId(req.base, req.quote),
        tdMode: "cash",
        side: req.side,
        ordType: "ioc",
        px: numStr(req.price),
        sz: numStr(req.amountBase),
        clOrdId: req.clientOrderId,
      });
      return signOkx(creds, "POST", "/api/v5/trade/order", body, nowMs, apiBase);
    },
    async placeOrder(req) {
      const [row] = unwrap(await send(fetchFn, this.signPlaceOrder(req, now()), "okx place"), "okx place");
      if (row && row.sCode !== undefined && row.sCode !== "0") throw new Error(`okx place: ${row.sCode}: ${row.sMsg}`);
      return this.getOrder(req, String(row?.ordId ?? ""));
    },
    async getOrder(req, orderId) {
      const path = `/api/v5/trade/order?instId=${instId(req.base, req.quote)}&ordId=${orderId}`;
      const [row] = unwrap(await send(fetchFn, signOkx(creds, "GET", path, "", now(), apiBase), "okx order"), "okx order");
      return toResult(row ?? {});
    },
    async getBalance(asset) {
      const path = `/api/v5/account/balance?ccy=${asset}`;
      const [acct] = unwrap(await send(fetchFn, signOkx(creds, "GET", path, "", now(), apiBase), "okx balance"), "okx balance");
      const details = Array.isArray(acct?.details) ? acct.details.map(rec) : [];
      return { asset, available: num(details.find((d) => d.ccy === asset)?.availBal) };
    },
    async getSymbolRules(base, quote) {
      const res = await fetchFn(`${apiBase}/api/v5/public/instruments?instType=SPOT&instId=${instId(base, quote)}`);
      const [row] = unwrap(JSON.parse(await res.text()), "okx instruments");
      return { lotStep: num(row?.lotSz), tickSize: num(row?.tickSz), minNotional: num(row?.minSz) * 0 };
    },
  };
}
