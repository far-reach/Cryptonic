import { fillBuy, fillSell } from "./depth.js";
import { DEFAULT_FEES, DEFAULT_WITHDRAWALS, feesFor, withdrawalFor } from "./fees.js";
import { pairKey } from "./symbols.js";
import { bps, round2 } from "./types.js";
import type { CrossExchangeOpportunity, FeeTable, OrderBook, Quote, WithdrawalTable } from "./types.js";

export interface CrossExchangeOptions {
  /** Quote-currency size to evaluate (default 1 000). */
  notionalQuote?: number;
  /** Keep only opportunities with at least this net edge (default 0). */
  minNetBps?: number;
  /** Gross gaps above this are reported as suspicious rather than tradable (default 300 bps = 3%). */
  suspiciousGrossBps?: number;
  /** Drop quotes older than this relative to the freshest quote in the set (default 30 s). */
  maxQuoteAgeMs?: number;
  fees?: FeeTable;
  withdrawals?: WithdrawalTable;
  /** Order books keyed by `${venue}:${base}/${quote}`; used for depth-aware pricing when present. */
  books?: Map<string, OrderBook>;
}

export const bookKey = (venue: string, base: string, quote: string): string => `${venue}:${pairKey(base, quote)}`;

/**
 * Cross-exchange detector. For every market quoted on ≥2 venues, pair each
 * venue's ask against every other venue's bid, charge taker fees on both legs,
 * cap size by what is actually resting at those prices, and (optionally) price
 * a transfer of the asset from the buy venue to the sell venue.
 *
 * Returns tradable candidates sorted by net edge; suspicious ones (huge gaps that
 * almost always mean two different assets share a ticker, or a halted market)
 * are returned separately so they never top the list.
 */
export function findCrossExchange(
  quotes: readonly Quote[],
  opts: CrossExchangeOptions = {},
): { opportunities: CrossExchangeOpportunity[]; suspicious: CrossExchangeOpportunity[] } {
  const notional = opts.notionalQuote ?? 1_000;
  const minNet = opts.minNetBps ?? 0;
  const suspiciousAt = opts.suspiciousGrossBps ?? 300;
  const maxAge = opts.maxQuoteAgeMs ?? 30_000;
  const fees = opts.fees ?? DEFAULT_FEES;
  const withdrawals = opts.withdrawals ?? DEFAULT_WITHDRAWALS;

  const newest = quotes.reduce((m, q) => Math.max(m, q.ts), 0);
  const fresh = quotes.filter((q) => q.bid > 0 && q.ask > 0 && q.ask >= q.bid && newest - q.ts <= maxAge);

  const byPair = new Map<string, Quote[]>();
  for (const q of fresh) {
    const k = pairKey(q.base, q.quote);
    const arr = byPair.get(k);
    if (arr) arr.push(q);
    else byPair.set(k, [q]);
  }

  const opportunities: CrossExchangeOpportunity[] = [];
  const suspicious: CrossExchangeOpportunity[] = [];

  for (const group of byPair.values()) {
    if (group.length < 2) continue;
    for (const buy of group) {
      for (const sell of group) {
        if (buy.venue === sell.venue) continue;
        if (sell.bid <= buy.ask) continue; // no gross edge at top of book

        let buyPrice = buy.ask;
        let sellPrice = sell.bid;
        let maxNotional = Math.min(buy.askSize * buy.ask, sell.bidSize * sell.bid);
        let depthChecked = false;

        const buyBook = opts.books?.get(bookKey(buy.venue, buy.base, buy.quote));
        const sellBook = opts.books?.get(bookKey(sell.venue, sell.base, sell.quote));
        if (buyBook && sellBook && buyBook.asks.length && sellBook.bids.length) {
          const b = fillBuy(buyBook.asks, notional);
          const s = fillSell(sellBook.bids, b.filledBase);
          if (b.filledBase > 0 && s.filledBase > 0) {
            buyPrice = b.avgPrice;
            sellPrice = s.avgPrice;
            depthChecked = true;
            // Largest notional before either side exhausts at the chosen price levels.
            maxNotional = Math.min(
              buyBook.asks.reduce((n, l) => n + l.price * l.size, 0),
              sellBook.bids.reduce((n, l) => n + l.price * l.size, 0),
            );
            if (b.exhausted || s.exhausted) maxNotional = Math.min(maxNotional, Math.min(b.filledQuote, s.filledQuote));
          }
        }
        if (sellPrice <= buyPrice) continue;

        const gross = bps((sellPrice - buyPrice) / buyPrice);
        const feeBps = feesFor(fees, buy.venue).spotTakerBps + feesFor(fees, sell.venue).spotTakerBps;
        const net = gross - feeBps;

        const w = withdrawalFor(withdrawals, buy.venue, buy.base);
        let netAfterTransfer: number | undefined;
        let transferMinutes: number | undefined;
        if (w) {
          const baseBought = notional / buyPrice;
          const transferBps = baseBought > 0 ? bps(w.fee / baseBought) : Infinity;
          netAfterTransfer = net - transferBps;
          transferMinutes = w.minutes;
        }

        const opp: CrossExchangeOpportunity = {
          kind: "cross-exchange",
          base: buy.base,
          quote: buy.quote,
          buyVenue: buy.venue,
          sellVenue: sell.venue,
          buyPrice,
          sellPrice,
          notionalQuote: notional,
          maxNotionalQuote: round2(maxNotional),
          grossBps: round2(gross),
          feesBps: round2(feeBps),
          netBps: round2(net),
          netAfterTransferBps: netAfterTransfer === undefined ? undefined : round2(netAfterTransfer),
          transferMinutes,
          suspicious: gross >= suspiciousAt,
          depthChecked,
          quoteAgeMs: Math.max(newest - buy.ts, newest - sell.ts),
        };
        if (opp.suspicious) suspicious.push(opp);
        else if (net >= minNet) opportunities.push(opp);
      }
    }
  }

  const byNet = (a: CrossExchangeOpportunity, b: CrossExchangeOpportunity) => b.netBps - a.netBps;
  opportunities.sort(byNet);
  suspicious.sort(byNet);
  return { opportunities, suspicious };
}
