import { parseLevels } from "../depth.js";
import { splitDelimited } from "../symbols.js";
import type { FetchLike, OrderBook, PerpQuote, Quote } from "../types.js";
import { defaultFetch, getJson, num, num0 } from "./common.js";

export const OKX_API = "https://www.okx.com";

interface OkxEnvelope {
  code?: string;
  msg?: string;
  data?: unknown;
}

function unwrap(json: unknown, label: string): unknown[] {
  const env = json as OkxEnvelope;
  if (env.code !== undefined && env.code !== "0") throw new Error(`${label}: OKX API error ${env.code}: ${env.msg ?? ""}`);
  return Array.isArray(env.data) ? env.data : [];
}

/** GET /api/v5/market/tickers?instType=SPOT → data[{ instId: "BTC-USDT", bidPx, bidSz, askPx, askSz, ts }]. */
export function parseOkxSpotTickers(json: unknown, now = Date.now()): Quote[] {
  const out: Quote[] = [];
  for (const r of unwrap(json, "okx spot tickers") as Record<string, unknown>[]) {
    const split = splitDelimited(typeof r.instId === "string" ? r.instId : "");
    const bid = num(r.bidPx);
    const ask = num(r.askPx);
    if (!split || !(bid > 0) || !(ask > 0)) continue;
    out.push({ venue: "okx", ...split, bid, ask, bidSize: num0(r.bidSz), askSize: num0(r.askSz), ts: num(r.ts) || now });
  }
  return out;
}

/**
 * GET /api/v5/market/tickers?instType=SWAP for bid/ask, joined with
 * GET /api/v5/public/funding-rate?instId=ANY (fundingRate, fundingTime,
 * nextFundingTime; interval is derived from the two timestamps). Only
 * USDT-margined linear swaps ("BTC-USDT-SWAP") are kept.
 */
export function parseOkxPerps(tickers: unknown, funding: unknown, now = Date.now()): PerpQuote[] {
  const rates = new Map<string, Record<string, unknown>>();
  for (const r of unwrap(funding, "okx funding") as Record<string, unknown>[]) if (typeof r.instId === "string") rates.set(r.instId, r);
  const out: PerpQuote[] = [];
  for (const r of unwrap(tickers, "okx swap tickers") as Record<string, unknown>[]) {
    const instId = typeof r.instId === "string" ? r.instId : "";
    if (!instId.endsWith("-SWAP")) continue;
    const split = splitDelimited(instId);
    const f = rates.get(instId);
    const bid = num(r.bidPx);
    const ask = num(r.askPx);
    const fundingRate = num(f?.fundingRate);
    if (!split || !(bid > 0) || !(ask > 0) || !Number.isFinite(fundingRate)) continue;
    const t0 = num(f?.fundingTime);
    const t1 = num(f?.nextFundingTime);
    const hours = t0 > 0 && t1 > t0 ? Math.round((t1 - t0) / 3_600_000) : 8;
    out.push({
      venue: "okx",
      ...split,
      bid,
      ask,
      markPrice: undefined,
      indexPrice: undefined,
      fundingRate,
      fundingIntervalHours: hours > 0 ? hours : 8,
      nextFundingTime: t1 || undefined,
      ts: num(r.ts) || now,
    });
  }
  return out;
}

/** GET /api/v5/market/books?instId=…&sz=… → data[0] { asks: [[px, sz, …]], bids, ts }. */
export function parseOkxOrderBook(json: unknown, base: string, quote: string, now = Date.now()): OrderBook {
  const first = unwrap(json, "okx books")[0] as Record<string, unknown> | undefined;
  return { venue: "okx", base, quote, bids: parseLevels(first?.bids, "bids"), asks: parseLevels(first?.asks, "asks"), ts: num(first?.ts) || now };
}

export async function fetchOkxSpotQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = OKX_API): Promise<Quote[]> {
  return parseOkxSpotTickers(await getJson(fetchFn, `${apiBase}/api/v5/market/tickers?instType=SPOT`, "okx spot"));
}

export async function fetchOkxPerpQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = OKX_API): Promise<PerpQuote[]> {
  const [tickers, funding] = await Promise.all([
    getJson(fetchFn, `${apiBase}/api/v5/market/tickers?instType=SWAP`, "okx swap"),
    getJson(fetchFn, `${apiBase}/api/v5/public/funding-rate?instId=ANY`, "okx funding"),
  ]);
  return parseOkxPerps(tickers, funding);
}

export async function fetchOkxOrderBook(
  base: string,
  quote: string,
  fetchFn: FetchLike = defaultFetch(),
  apiBase = OKX_API,
  limit = 50,
): Promise<OrderBook> {
  return parseOkxOrderBook(await getJson(fetchFn, `${apiBase}/api/v5/market/books?instId=${base}-${quote}&sz=${limit}`, "okx books"), base, quote);
}
