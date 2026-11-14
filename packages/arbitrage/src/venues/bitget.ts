import { parseLevels } from "../depth.js";
import { splitSymbol } from "../symbols.js";
import type { FetchLike, OrderBook, PerpQuote, Quote, WithdrawalCost } from "../types.js";
import { defaultFetch, getJson, num, num0 } from "./common.js";

export const BITGET_API = "https://api.bitget.com";

interface BitgetEnvelope {
  code?: string;
  msg?: string;
  data?: unknown;
}

function unwrap(json: unknown, label: string): unknown {
  const env = json as BitgetEnvelope;
  if (env.code !== undefined && env.code !== "00000") throw new Error(`${label}: Bitget API error ${env.code}: ${env.msg ?? ""}`);
  return env.data;
}

/** GET /api/v2/spot/market/tickers → rows with symbol, bidPr, askPr, bidSz, askSz, ts. */
export function parseBitgetSpotTickers(json: unknown, now = Date.now()): Quote[] {
  const data = unwrap(json, "bitget spot tickers");
  if (!Array.isArray(data)) return [];
  const out: Quote[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const sym = typeof r.symbol === "string" ? r.symbol : "";
    const split = splitSymbol(sym);
    const bid = num(r.bidPr);
    const ask = num(r.askPr);
    if (!split || !(bid > 0) || !(ask > 0)) continue;
    out.push({ venue: "bitget", ...split, bid, ask, bidSize: num0(r.bidSz), askSize: num0(r.askSz), ts: num(r.ts) || now });
  }
  return out;
}

/** GET /api/v2/mix/market/tickers?productType=USDT-FUTURES → rows incl. fundingRate, markPrice, indexPrice. */
export function parseBitgetPerpTickers(json: unknown, intervals: Map<string, number> = new Map(), now = Date.now()): PerpQuote[] {
  const data = unwrap(json, "bitget perp tickers");
  if (!Array.isArray(data)) return [];
  const out: PerpQuote[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const sym = typeof r.symbol === "string" ? r.symbol : "";
    const split = splitSymbol(sym);
    const bid = num(r.bidPr);
    const ask = num(r.askPr);
    const funding = num(r.fundingRate);
    if (!split || !(bid > 0) || !(ask > 0) || !Number.isFinite(funding)) continue;
    out.push({
      venue: "bitget",
      ...split,
      bid,
      ask,
      markPrice: num(r.markPrice) || undefined,
      indexPrice: num(r.indexPrice) || undefined,
      fundingRate: funding,
      fundingIntervalHours: intervals.get(sym.toUpperCase()) ?? 8,
      ts: num(r.ts) || now,
    });
  }
  return out;
}

/** GET /api/v2/mix/market/contracts → symbol → fundInterval (hours). */
export function parseBitgetContracts(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const data = unwrap(json, "bitget contracts");
  if (!Array.isArray(data)) return out;
  for (const r of data as Record<string, unknown>[]) {
    const sym = typeof r.symbol === "string" ? r.symbol.toUpperCase() : "";
    const h = num(r.fundInterval);
    if (sym && h > 0) out.set(sym, h);
  }
  return out;
}

/** GET /api/v2/spot/market/orderbook?symbol=…&type=step0&limit=… → { asks, bids, ts }. */
export function parseBitgetOrderBook(json: unknown, base: string, quote: string, now = Date.now()): OrderBook {
  const data = unwrap(json, "bitget orderbook") as Record<string, unknown> | undefined;
  return {
    venue: "bitget",
    base,
    quote,
    bids: parseLevels(data?.bids, "bids"),
    asks: parseLevels(data?.asks, "asks"),
    ts: num(data?.ts) || now,
  };
}

/** GET /api/v2/spot/public/coins → coin → cheapest chain's withdrawal fee. */
export function parseBitgetWithdrawals(json: unknown): Record<string, WithdrawalCost> {
  const out: Record<string, WithdrawalCost> = {};
  const data = unwrap(json, "bitget coins");
  if (!Array.isArray(data)) return out;
  for (const r of data as Record<string, unknown>[]) {
    const coin = typeof r.coin === "string" ? r.coin.toUpperCase() : "";
    const chains = Array.isArray(r.chains) ? (r.chains as Record<string, unknown>[]) : [];
    let best: WithdrawalCost | undefined;
    for (const c of chains) {
      if (c.withdrawable === "false") continue;
      const fee = num(c.withdrawFee);
      if (!Number.isFinite(fee)) continue;
      const minutes = Math.max(1, Math.round((num0(c.withdrawConfirm) || 12) * 0.5)); // rough: ~30 s/confirm
      if (!best || fee < best.fee) best = { fee, minutes };
    }
    if (coin && best) out[coin] = best;
  }
  return out;
}

export async function fetchBitgetSpotQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BITGET_API): Promise<Quote[]> {
  return parseBitgetSpotTickers(await getJson(fetchFn, `${apiBase}/api/v2/spot/market/tickers`, "bitget spot"));
}

export async function fetchBitgetPerpQuotes(fetchFn: FetchLike = defaultFetch(), apiBase = BITGET_API): Promise<PerpQuote[]> {
  const [tickers, contracts] = await Promise.all([
    getJson(fetchFn, `${apiBase}/api/v2/mix/market/tickers?productType=USDT-FUTURES`, "bitget perp"),
    getJson(fetchFn, `${apiBase}/api/v2/mix/market/contracts?productType=USDT-FUTURES`, "bitget contracts").catch(() => null),
  ]);
  return parseBitgetPerpTickers(tickers, contracts ? parseBitgetContracts(contracts) : new Map());
}

export async function fetchBitgetOrderBook(
  base: string,
  quote: string,
  fetchFn: FetchLike = defaultFetch(),
  apiBase = BITGET_API,
  limit = 50,
): Promise<OrderBook> {
  const url = `${apiBase}/api/v2/spot/market/orderbook?symbol=${base}${quote}&type=step0&limit=${limit}`;
  return parseBitgetOrderBook(await getJson(fetchFn, url, "bitget orderbook"), base, quote);
}

export async function fetchBitgetWithdrawals(fetchFn: FetchLike = defaultFetch(), apiBase = BITGET_API): Promise<Record<string, WithdrawalCost>> {
  return parseBitgetWithdrawals(await getJson(fetchFn, `${apiBase}/api/v2/spot/public/coins`, "bitget coins"));
}
