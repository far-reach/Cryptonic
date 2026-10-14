import { parseLevels } from "../depth.js";
import { splitSymbol } from "../symbols.js";
import type { FetchLike, OrderBook, PerpQuote, Quote } from "../types.js";
import { defaultFetch, getJson, num, num0 } from "./common.js";

export const BINANCE_SPOT_API = "https://api.binance.com";
export const BINANCE_FUTURES_API = "https://fapi.binance.com";

/** GET /api/v3/ticker/bookTicker → [{ symbol, bidPrice, bidQty, askPrice, askQty }]. */
export function parseBinanceBookTickers(json: unknown, now = Date.now()): Quote[] {
  if (!Array.isArray(json)) return [];
  const out: Quote[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const split = splitSymbol(typeof r.symbol === "string" ? r.symbol : "");
    const bid = num(r.bidPrice);
    const ask = num(r.askPrice);
    if (!split || !(bid > 0) || !(ask > 0)) continue;
    out.push({ venue: "binance", ...split, bid, ask, bidSize: num0(r.bidQty), askSize: num0(r.askQty), ts: num(r.time) || now });
  }
  return out;
}

/**
 * GET /fapi/v1/premiumIndex → [{ symbol, markPrice, indexPrice, lastFundingRate, nextFundingTime }]
 * joined with GET /fapi/v1/ticker/bookTicker for bid/ask. Binance settles most
 * USDT-M contracts every 8 h; a few run on 4 h, which /fapi/v1/fundingInfo lists.
 */
export function parseBinancePerps(premium: unknown, book: unknown, intervals: Map<string, number> = new Map(), now = Date.now()): PerpQuote[] {
  if (!Array.isArray(premium)) return [];
  const books = new Map<string, Record<string, unknown>>();
  if (Array.isArray(book)) for (const r of book as Record<string, unknown>[]) if (typeof r.symbol === "string") books.set(r.symbol, r);
  const out: PerpQuote[] = [];
  for (const r of premium as Record<string, unknown>[]) {
    const sym = typeof r.symbol === "string" ? r.symbol : "";
    const split = splitSymbol(sym);
    const b = books.get(sym);
    const bid = num(b?.bidPrice);
    const ask = num(b?.askPrice);
    const funding = num(r.lastFundingRate);
    if (!split || !(bid > 0) || !(ask > 0) || !Number.isFinite(funding)) continue;
    out.push({
      venue: "binance",
      ...split,
      bid,
      ask,
      markPrice: num(r.markPrice) || undefined,
      indexPrice: num(r.indexPrice) || undefined,
      fundingRate: funding,
      fundingIntervalHours: intervals.get(sym) ?? 8,
      nextFundingTime: num(r.nextFundingTime) || undefined,
      ts: num(r.time) || now,
    });
  }
  return out;
}

/** GET /fapi/v1/fundingInfo → [{ symbol, fundingIntervalHours, … }] (only non-default contracts are listed). */
export function parseBinanceFundingInfo(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(json)) return out;
  for (const r of json as Record<string, unknown>[]) {
    const h = num(r.fundingIntervalHours);
    if (typeof r.symbol === "string" && h > 0) out.set(r.symbol, h);
  }
  return out;
}

/** GET /api/v3/depth?symbol=…&limit=… → { bids: [[p,q]], asks: [[p,q]] }. */
export function parseBinanceOrderBook(json: unknown, base: string, quote: string, now = Date.now()): OrderBook {
  const r = json as Record<string, unknown> | null;
  return { venue: "binance", base, quote, bids: parseLevels(r?.bids, "bids"), asks: parseLevels(r?.asks, "asks"), ts: now };
}

export async function fetchBinanceSpotQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BINANCE_SPOT_API): Promise<Quote[]> {
  return parseBinanceBookTickers(await getJson(fetchFn, `${apiBase}/api/v3/ticker/bookTicker`, "binance spot"));
}

export async function fetchBinancePerpQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BINANCE_FUTURES_API): Promise<PerpQuote[]> {
  const [premium, book, info] = await Promise.all([
    getJson(fetchFn, `${apiBase}/fapi/v1/premiumIndex`, "binance premiumIndex"),
    getJson(fetchFn, `${apiBase}/fapi/v1/ticker/bookTicker`, "binance perp book"),
    getJson(fetchFn, `${apiBase}/fapi/v1/fundingInfo`, "binance fundingInfo").catch(() => null),
  ]);
  return parseBinancePerps(premium, book, info ? parseBinanceFundingInfo(info) : new Map());
}

export async function fetchBinanceOrderBook(
  base: string,
  quote: string,
  fetchFn: FetchLike = defaultFetch(),
  apiBase = BINANCE_SPOT_API,
  limit = 50,
): Promise<OrderBook> {
  return parseBinanceOrderBook(await getJson(fetchFn, `${apiBase}/api/v3/depth?symbol=${base}${quote}&limit=${limit}`, "binance depth"), base, quote);
}
