import { DEFAULT_FEES, feesFor } from "./fees.js";
import { bps, round2 } from "./types.js";
import type { BasisOpportunity, FeeTable, FundingSpreadOpportunity, PerpQuote, Quote } from "./types.js";

export interface BasisOptions {
  /** Holding horizon used to amortise entry/exit fees (default 30 days). */
  holdDays?: number;
  /**
   * One row per perp: the spot leg on the same venue when it exists (one account,
   * one margin pool), otherwise the venue with the best spot price. Default true;
   * false lists every spot/perp venue combination.
   */
  dedupe?: boolean;
  /** Keep only positions with at least this net APR in percent (default 0). */
  minNetAprPct?: number;
  fees?: FeeTable;
  /** Only USDT-margined perps vs spot quoted in these currencies (default USDT, USDC). */
  quotes?: readonly string[];
}

const HOURS_PER_YEAR = 24 * 365;

export const annualisePct = (ratePerInterval: number, intervalHours: number): number =>
  ratePerInterval * (HOURS_PER_YEAR / intervalHours) * 100;

/**
 * Spot/perp carry. With funding > 0 (longs pay shorts) you buy spot and short the
 * perp of equal size: delta-neutral, you collect funding every interval. With
 * funding < 0 the mirror trade needs borrowable spot (or a margin account), so it
 * is reported but flagged by direction. Fees: taker on all four fills (open and
 * close both legs), amortised over `holdDays`. The basis itself (perp − spot) is
 * reported, not counted as profit: on a perpetual it mean-reverts via funding
 * rather than converging at expiry.
 */
export function findBasis(spot: readonly Quote[], perps: readonly PerpQuote[], opts: BasisOptions = {}): BasisOpportunity[] {
  const holdDays = opts.holdDays ?? 30;
  const minNet = opts.minNetAprPct ?? 0;
  const fees = opts.fees ?? DEFAULT_FEES;
  const quotes = new Set(opts.quotes ?? ["USDT", "USDC"]);

  const spotByBase = new Map<string, Quote[]>();
  for (const q of spot) {
    if (!quotes.has(q.quote) || !(q.ask > 0) || !(q.bid > 0)) continue;
    const arr = spotByBase.get(q.base);
    if (arr) arr.push(q);
    else spotByBase.set(q.base, [q]);
  }

  const out: BasisOpportunity[] = [];
  for (const p of perps) {
    if (!quotes.has(p.quote) || !(p.bid > 0) || !(p.ask > 0) || !Number.isFinite(p.fundingRate)) continue;
    let candidates = spotByBase.get(p.base) ?? [];
    if (opts.dedupe !== false && candidates.length > 1) {
      const same = candidates.filter((s) => s.venue === p.venue);
      if (same.length) candidates = same;
      else {
        // best entry price for the direction: lowest ask when buying spot, highest bid when shorting it
        const best = candidates.reduce((a, b) => (p.fundingRate >= 0 ? (b.ask < a.ask ? b : a) : b.bid > a.bid ? b : a));
        candidates = [best];
      }
    }
    for (const s of candidates) {
      const positive = p.fundingRate >= 0;
      const direction = positive ? "long-spot-short-perp" : "short-spot-long-perp";
      const spotPrice = positive ? s.ask : s.bid; // buy spot at ask, or sell/short at bid
      const perpPrice = positive ? p.bid : p.ask; // short perp at bid, or long at ask
      const roundTrip = 2 * (feesFor(fees, s.venue).spotTakerBps + feesFor(fees, p.venue).perpTakerBps);
      const grossApr = annualisePct(Math.abs(p.fundingRate), p.fundingIntervalHours);
      const feeAprDrag = (roundTrip / 100) * (365 / holdDays); // bps → % then annualise over the hold
      const netApr = grossApr - feeAprDrag;
      const perIntervalBps = bps(Math.abs(p.fundingRate));
      const breakevenHours = perIntervalBps > 0 ? (roundTrip / perIntervalBps) * p.fundingIntervalHours : Infinity;
      if (netApr < minNet) continue;
      out.push({
        kind: "basis",
        base: p.base,
        spotVenue: s.venue,
        perpVenue: p.venue,
        direction,
        spotPrice,
        perpPrice,
        basisBps: round2(bps((perpPrice - spotPrice) / spotPrice)),
        fundingRate: p.fundingRate,
        fundingIntervalHours: p.fundingIntervalHours,
        fundingAprPct: round2(grossApr),
        roundTripFeesBps: round2(roundTrip),
        breakevenHours: Number.isFinite(breakevenHours) ? round2(breakevenHours) : Infinity,
        netAprPct: round2(netApr),
        holdDays,
      });
    }
  }
  out.sort((a, b) => b.netAprPct - a.netAprPct);
  return out;
}

/**
 * Same asset's perp on two venues with different funding: long where funding is
 * lower, short where it is higher. Delta-neutral and needs no spot inventory,
 * but both legs are leveraged so liquidation risk must be managed separately.
 * Only comparable when both contracts settle on the same interval.
 */
export function findFundingSpreads(perps: readonly PerpQuote[], opts: BasisOptions = {}): FundingSpreadOpportunity[] {
  const holdDays = opts.holdDays ?? 30;
  const minNet = opts.minNetAprPct ?? 0;
  const fees = opts.fees ?? DEFAULT_FEES;
  const byBase = new Map<string, PerpQuote[]>();
  for (const p of perps) {
    if (!Number.isFinite(p.fundingRate)) continue;
    const arr = byBase.get(`${p.base}/${p.quote}`);
    if (arr) arr.push(p);
    else byBase.set(`${p.base}/${p.quote}`, [p]);
  }
  const out: FundingSpreadOpportunity[] = [];
  for (const group of byBase.values()) {
    for (const lo of group) {
      for (const hi of group) {
        if (lo.venue === hi.venue || lo.fundingIntervalHours !== hi.fundingIntervalHours) continue;
        const spread = hi.fundingRate - lo.fundingRate;
        if (spread <= 0) continue;
        const roundTrip = 2 * (feesFor(fees, lo.venue).perpTakerBps + feesFor(fees, hi.venue).perpTakerBps);
        const grossApr = annualisePct(spread, hi.fundingIntervalHours);
        const netApr = grossApr - (roundTrip / 100) * (365 / holdDays);
        if (netApr < minNet) continue;
        out.push({
          kind: "funding-spread",
          base: lo.base,
          longVenue: lo.venue,
          shortVenue: hi.venue,
          longFundingRate: lo.fundingRate,
          shortFundingRate: hi.fundingRate,
          spread,
          fundingIntervalHours: hi.fundingIntervalHours,
          spreadAprPct: round2(grossApr),
          roundTripFeesBps: round2(roundTrip),
          netAprPct: round2(netApr),
          holdDays,
        });
      }
    }
  }
  out.sort((a, b) => b.netAprPct - a.netAprPct);
  return out;
}
