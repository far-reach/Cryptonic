import { parseLevels } from "../depth.js";
import { splitSymbol } from "../symbols.js";
import type { FetchLike, OrderBook, PerpQuote, Quote } from "../types.js";
import { defaultFetch, getJson, num, num0 } from "./common.js";

export const BYBIT_API = "https://api.bybit.com";

interface BybitEnvelope {
  retCode?: number;
  retMsg?: string;
  result?: { list?: unknown; a?: unknown; b?: unknown; ts?: unknown };
  time?: unknown;
}

function unwrap(json: unknown, label: string): BybitEnvelope["result"] {
  const env = json as BybitEnvelope;
  if (env.retCode !== undefined && env.retCode !== 0) throw new Error(`${label}: Bybit API error ${env.retCode}: ${env.retMsg ?? ""}`);
  return env.result;
}

/** GET /v5/market/tickers?category=spot → result.list[{ symbol, bid1Price, bid1Size, ask1Price, ask1Size }]. */
export function parseBybitSpotTickers(json: unknown, now = Date.now()): Quote[] {
  const res = unwrap(json, "bybit spot tickers");
  const list = Array.isArray(res?.list) ? (res!.list as Record<string, unknown>[]) : [];
  const ts = num((json as BybitEnvelope).time) || now;
  const out: Quote[] = [];
  for (const r of list) {
    const split = splitSymbol(typeof r.symbol === "string" ? r.symbol : "");
    const bid = num(r.bid1Price);
    const ask = num(r.ask1Price);
    if (!split || !(bid > 0) || !(ask > 0)) continue;
    out.push({ venue: "bybit", ...split, bid, ask, bidSize: num0(r.bid1Size), askSize: num0(r.ask1Size), ts });
  }
  return out;
}

/** GET /v5/market/tickers?category=linear → adds fundingRate, nextFundingTime, markPrice, indexPrice. */
export function parseBybitPerpTickers(json: unknown, intervals: Map<string, number> = new Map(), now = Date.now()): PerpQuote[] {
  const res = unwrap(json, "bybit perp tickers");
  const list = Array.isArray(res?.list) ? (res!.list as Record<string, unknown>[]) : [];
  const ts = num((json as BybitEnvelope).time) || now;
  const out: PerpQuote[] = [];
  for (const r of list) {
    const sym = typeof r.symbol === "string" ? r.symbol : "";
    const split = splitSymbol(sym);
    const bid = num(r.bid1Price);
    const ask = num(r.ask1Price);
    const funding = num(r.fundingRate);
    if (!split || !(bid > 0) || !(ask > 0) || !Number.isFinite(funding)) continue;
    out.push({
      venue: "bybit",
      ...split,
      bid,
      ask,
      markPrice: num(r.markPrice) || undefined,
      indexPrice: num(r.indexPrice) || undefined,
      fundingRate: funding,
      fundingIntervalHours: intervals.get(sym) ?? 8,
      nextFundingTime: num(r.nextFundingTime) || undefined,
      ts,
    });
  }
  return out;
}

/** GET /v5/market/instruments-info?category=linear → fundingInterval is in minutes. */
export function parseBybitInstruments(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const res = unwrap(json, "bybit instruments");
  const list = Array.isArray(res?.list) ? (res!.list as Record<string, unknown>[]) : [];
  for (const r of list) {
    const minutes = num(r.fundingInterval);
    if (typeof r.symbol === "string" && minutes > 0) out.set(r.symbol, minutes / 60);
  }
  return out;
}

/** GET /v5/market/orderbook?category=spot&symbol=…&limit=… → result { b: [[p,q]], a: [[p,q]], ts }. */
export function parseBybitOrderBook(json: unknown, base: string, quote: string, now = Date.now()): OrderBook {
  const res = unwrap(json, "bybit orderbook");
  return { venue: "bybit", base, quote, bids: parseLevels(res?.b, "bids"), asks: parseLevels(res?.a, "asks"), ts: num(res?.ts) || now };
}

export async function fetchBybitSpotQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BYBIT_API): Promise<Quote[]> {
  return parseBybitSpotTickers(await getJson(fetchFn, `${apiBase}/v5/market/tickers?category=spot`, "bybit spot"));
}

export async function fetchBybitPerpQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BYBIT_API): Promise<PerpQuote[]> {
  const [tickers, instruments] = await Promise.all([
    getJson(fetchFn, `${apiBase}/v5/market/tickers?category=linear`, "bybit perp"),
    getJson(fetchFn, `${apiBase}/v5/market/instruments-info?category=linear&limit=1000`, "bybit instruments").catch(() => null),
  ]);
  return parseBybitPerpTickers(tickers, instruments ? parseBybitInstruments(instruments) : new Map());
}

export async function fetchBybitOrderBook(
  base: string,
  quote: string,
  fetchFn: FetchLike = defaultFetch(),
  apiBase = BYBIT_API,
  limit = 50,
): Promise<OrderBook> {
  const url = `${apiBase}/v5/market/orderbook?category=spot&symbol=${base}${quote}&limit=${limit}`;
  return parseBybitOrderBook(await getJson(fetchFn, url, "bybit orderbook"), base, quote);
}
