import { findBasis, findFundingSpreads } from "./basis.js";
import { bookKey, findCrossExchange } from "./crossExchange.js";
import { DEFAULT_FEES, DEFAULT_WITHDRAWALS } from "./fees.js";
import { findTriangles } from "./triangular.js";
import { VENUES } from "./types.js";
import type { FeeTable, FetchLike, OrderBook, PerpQuote, Quote, ScanResult, Venue, WithdrawalTable } from "./types.js";
import { ADAPTERS } from "./venues/index.js";

export interface ScanOptions {
  venues?: readonly Venue[];
  /** Quote currencies to consider (default USDT, USDC). Everything else is dropped before detection. */
  quotes?: readonly string[];
  notionalQuote?: number;
  minNetBps?: number;
  /** Minimum net APR (percent) for basis / funding-spread rows (default 5). */
  minNetAprPct?: number;
  holdDays?: number;
  /** Refine the top N cross-exchange candidates with full order books (default 0 = off). */
  depthTop?: number;
  /** Pull Bitget's live withdrawal-fee table for the transfer estimate (default true). */
  liveWithdrawals?: boolean;
  fees?: FeeTable;
  withdrawals?: WithdrawalTable;
  fetchFn?: FetchLike;
  /** Attach the normalised spot/perp quotes to the result (default false). */
  includeRaw?: boolean;
  /** Pre-fetched data (demo / tests); when set, no network calls are made for those venues. */
  preloaded?: { spot?: Quote[]; perps?: PerpQuote[]; books?: OrderBook[] };
  now?: number;
}

const settle = async <T>(label: string, p: Promise<T>, errors: string[], fallback: T): Promise<T> => {
  try {
    return await p;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}${cause}`);
    return fallback;
  }
};

/** Run every detector over fresh (or preloaded) data and return a ranked ScanResult. */
export async function scan(opts: ScanOptions = {}): Promise<ScanResult> {
  const venues = opts.venues ?? VENUES;
  const quotes = opts.quotes ?? ["USDT", "USDC"];
  const notionalQuote = opts.notionalQuote ?? 1_000;
  const minNetBps = opts.minNetBps ?? 0;
  const minNetAprPct = opts.minNetAprPct ?? 5;
  const holdDays = opts.holdDays ?? 30;
  const fees = opts.fees ?? DEFAULT_FEES;
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  const errors: string[] = [];
  const quoteSet = new Set(quotes);

  let spot: Quote[] = [];
  let perps: PerpQuote[] = [];
  const quoteCounts: Record<string, number> = {};
  const perpCounts: Record<string, number> = {};
  const withdrawals: WithdrawalTable = { ...(opts.withdrawals ?? DEFAULT_WITHDRAWALS) };

  if (opts.preloaded) {
    spot = opts.preloaded.spot ?? [];
    perps = opts.preloaded.perps ?? [];
  } else {
    const spotResults = await Promise.all(venues.map((v) => settle(`${v} spot`, ADAPTERS[v].spot(fetchFn), errors, [] as Quote[])));
    const perpResults = await Promise.all(venues.map((v) => settle(`${v} perps`, ADAPTERS[v].perps(fetchFn), errors, [] as PerpQuote[])));
    spot = spotResults.flat();
    perps = perpResults.flat();
    if (opts.liveWithdrawals !== false && venues.includes("bitget") && ADAPTERS.bitget.withdrawals) {
      const live = await settle("bitget withdrawals", ADAPTERS.bitget.withdrawals(fetchFn), errors, {});
      if (Object.keys(live).length) withdrawals.bitget = { ...withdrawals.bitget, ...live };
    }
  }
  for (const v of venues) {
    quoteCounts[v] = spot.filter((q) => q.venue === v).length;
    perpCounts[v] = perps.filter((p) => p.venue === v).length;
  }

  // Triangular needs every market (ETH/BTC legs etc.); the other detectors only compare quote-currency markets.
  const spotAll = spot.filter((q) => venues.includes(q.venue));
  spot = spotAll.filter((q) => quoteSet.has(q.quote));
  perps = perps.filter((p) => venues.includes(p.venue) && quoteSet.has(p.quote));

  // Pass 1: top-of-book cross-exchange scan.
  const books = new Map<string, OrderBook>();
  for (const b of opts.preloaded?.books ?? []) books.set(bookKey(b.venue, b.base, b.quote), b);
  const first = findCrossExchange(spot, { notionalQuote, minNetBps, fees, withdrawals, books });

  // Pass 2: pull real depth for the best candidates and re-price them.
  let crossExchange = first.opportunities;
  const depthTop = opts.depthTop ?? 0;
  if (depthTop > 0 && !opts.preloaded) {
    const wanted = new Set<string>();
    for (const o of crossExchange.slice(0, depthTop)) {
      wanted.add(bookKey(o.buyVenue, o.base, o.quote));
      wanted.add(bookKey(o.sellVenue, o.base, o.quote));
    }
    await Promise.all(
      [...wanted].map(async (key) => {
        const [venue, pair] = key.split(":") as [Venue, string];
        const [base, quote] = pair.split("/");
        const book = await settle(`${venue} book ${pair}`, ADAPTERS[venue].orderBook(base, quote, fetchFn, 50), errors, null as OrderBook | null);
        if (book) books.set(key, book);
      }),
    );
    if (books.size) crossExchange = findCrossExchange(spot, { notionalQuote, minNetBps, fees, withdrawals, books }).opportunities;
  }

  // Triangular: start from the configured quote currencies on each venue.
  const triangular = venues.flatMap((v) => findTriangles(spotAll, v, { startCurrencies: quotes, minNetBps, fees })).sort((a, b) => b.netBps - a.netBps);

  // Carry: spot/perp basis and cross-venue funding spreads.
  const basis = findBasis(spot, perps, { holdDays, minNetAprPct, fees, quotes });
  const fundingSpread = findFundingSpreads(perps, { holdDays, minNetAprPct, fees });

  return {
    generatedAt: opts.now ?? Date.now(),
    quoteCounts,
    perpCounts,
    crossExchange,
    triangular,
    basis,
    fundingSpread,
    suspicious: first.suspicious,
    errors,
    params: { notionalQuote, minNetBps, holdDays, quotes: [...quotes] },
    raw: opts.includeRaw ? { spot: spotAll, perps } : undefined,
  };
}
