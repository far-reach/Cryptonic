import { createHash } from "node:crypto";
import { fillBuy, fillSell } from "../depth.js";
import { DEFAULT_FEES, feesFor } from "../fees.js";
import { buildEdges } from "../triangular.js";
import { bps, round2 } from "../types.js";
import type {
  BasisOpportunity,
  CrossExchangeOpportunity,
  FeeTable,
  OrderBook,
  PerpQuote,
  Quote,
  TriangularOpportunity,
} from "../types.js";
import type { CarryCloseRecord, CarryMarkRecord, CarryOpenRecord, CarryPosition, DetectRecord, LedgerRecord, PaperState, VerifyRecord } from "./types.js";

/** Deterministic id for an opportunity at a point in time. */
export function opportunityId(o: CrossExchangeOpportunity | TriangularOpportunity, t: number): string {
  const key = o.kind === "cross-exchange" ? `${o.kind}|${o.base}/${o.quote}|${o.buyVenue}>${o.sellVenue}|${t}` : `${o.kind}|${o.venue}|${o.path.join(">")}|${t}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

export const opportunityLabel = (o: CrossExchangeOpportunity | TriangularOpportunity): string =>
  o.kind === "cross-exchange" ? `${o.base}/${o.quote} ${o.buyVenue}→${o.sellVenue}` : `${o.venue} ${o.path.join("→")}`;

/** Later snapshot used to re-price a detected opportunity. */
export interface Snapshot {
  t: number;
  spot: readonly Quote[];
  /** Order books keyed by `${venue}:${base}/${quote}` (see crossExchange.bookKey). */
  books?: ReadonlyMap<string, OrderBook>;
}

const findQuote = (spot: readonly Quote[], venue: string, base: string, quote: string): Quote | undefined =>
  spot.find((q) => q.venue === venue && q.base === base && q.quote === quote);

/**
 * Re-price a cross-exchange opportunity at the later snapshot. Buys `notional`
 * at the buy venue's later ask (walking the book when one is given), sells the
 * base bought at the sell venue's later bid, charges taker fees on both legs.
 */
export function verifyCrossExchange(o: CrossExchangeOpportunity, later: Snapshot, fees: FeeTable = DEFAULT_FEES): { netBps: number | null; pnl: number } {
  const key = (v: string) => `${v}:${o.base}/${o.quote}`;
  const buyBook = later.books?.get(key(o.buyVenue));
  const sellBook = later.books?.get(key(o.sellVenue));
  const buyQ = findQuote(later.spot, o.buyVenue, o.base, o.quote);
  const sellQ = findQuote(later.spot, o.sellVenue, o.base, o.quote);

  let boughtBase: number;
  let spentQuote: number;
  if (buyBook?.asks.length) {
    const f = fillBuy(buyBook.asks, o.notionalQuote);
    boughtBase = f.filledBase;
    spentQuote = f.filledQuote;
  } else if (buyQ && buyQ.ask > 0) {
    spentQuote = o.notionalQuote;
    boughtBase = o.notionalQuote / buyQ.ask;
  } else return { netBps: null, pnl: 0 };
  if (!(boughtBase > 0)) return { netBps: null, pnl: 0 };

  let receivedQuote: number;
  if (sellBook?.bids.length) {
    const f = fillSell(sellBook.bids, boughtBase);
    // base that could not be sold is marked at the worst bid reached (conservative)
    const unsold = boughtBase - f.filledBase;
    const worst = sellBook.bids[sellBook.bids.length - 1].price;
    receivedQuote = f.filledQuote + unsold * worst;
  } else if (sellQ && sellQ.bid > 0) receivedQuote = boughtBase * sellQ.bid;
  else return { netBps: null, pnl: 0 };

  const feeQuote = (spentQuote * feesFor(fees, o.buyVenue).spotTakerBps + receivedQuote * feesFor(fees, o.sellVenue).spotTakerBps) / 10_000;
  const pnl = receivedQuote - spentQuote - feeQuote;
  return { netBps: round2(bps(pnl / spentQuote)), pnl: round2(pnl) };
}

/** Re-price a triangular cycle leg by leg at the later snapshot (top of book, fee-adjusted). */
export function verifyTriangular(
  o: TriangularOpportunity,
  later: Snapshot,
  fees: FeeTable = DEFAULT_FEES,
  notional = Math.min(o.maxNotionalStart, 1_000),
): { netBps: number | null; pnl: number } {
  const edges = buildEdges(later.spot, o.venue, fees);
  let amount = 1;
  for (let i = 0; i < o.legs.length; i++) {
    const from = o.path[i];
    const to = o.path[i + 1];
    const e = edges.find((x) => x.from === from && x.to === to && x.pair === o.legs[i].pair);
    if (!e) return { netBps: null, pnl: 0 };
    amount *= e.rate;
  }
  const netBps = round2(bps(amount - 1));
  return { netBps, pnl: round2((amount - 1) * notional) };
}

export interface VerifyInput {
  detectedAt: number;
  opportunities: readonly (CrossExchangeOpportunity | TriangularOpportunity)[];
  later: Snapshot;
  fees?: FeeTable;
  /** Start-currency size used to value triangular fills (capped by each cycle's own capacity). Default 1 000. */
  notionalQuote?: number;
}

/** Build detect + verify records for one scan → re-scan pair. Pure. */
export function verifyOpportunities(input: VerifyInput): { detects: DetectRecord[]; verifies: VerifyRecord[] } {
  const fees = input.fees ?? DEFAULT_FEES;
  const detects: DetectRecord[] = [];
  const verifies: VerifyRecord[] = [];
  for (const o of input.opportunities) {
    const id = opportunityId(o, input.detectedAt);
    detects.push({ type: "detect", t: input.detectedAt, id, opportunity: o });
    const triNotional = Math.min(o.kind === "triangular" ? o.maxNotionalStart : 0, input.notionalQuote ?? 1_000);
    const r = o.kind === "cross-exchange" ? verifyCrossExchange(o, input.later, fees) : verifyTriangular(o, input.later, fees, triNotional);
    verifies.push({
      type: "verify",
      t: input.later.t,
      id,
      kind: o.kind,
      label: opportunityLabel(o),
      venues: o.kind === "cross-exchange" ? [o.buyVenue, o.sellVenue] : [o.venue],
      delayMs: input.later.t - input.detectedAt,
      notionalQuote: o.kind === "cross-exchange" ? o.notionalQuote : triNotional,
      expectedNetBps: o.netBps,
      realisedNetBps: r.netBps,
      pnlQuote: r.pnl,
      survived: r.netBps !== null && r.netBps > 0,
    });
  }
  return { detects, verifies };
}

export interface CarryOptions {
  notionalQuote: number;
  holdDays: number;
  /** Open a paper position only above this net APR (%). */
  minNetAprPct: number;
  /** Close after this many consecutive marks with funding against the position (default 3). */
  maxAdverseMarks?: number;
  /** Max simultaneous paper positions (default 10). */
  maxPositions?: number;
  /** Skip directions that need borrowed spot (default true: only long-spot/short-perp). */
  longOnly?: boolean;
  now: number;
}

/**
 * Advance paper carry positions by one run. Marks every open position at the
 * latest perp/spot prices, accrues funding pro rata to elapsed time, closes
 * those that hit the hold horizon / flipped / vanished, then opens new ones
 * from the current basis table. Pure: returns the new state and the records.
 */
export function stepCarry(
  state: PaperState,
  basis: readonly BasisOpportunity[],
  spot: readonly Quote[],
  perps: readonly PerpQuote[],
  opts: CarryOptions,
): { state: PaperState; records: LedgerRecord[] } {
  const records: LedgerRecord[] = [];
  const maxAdverse = opts.maxAdverseMarks ?? 3;
  const maxPositions = opts.maxPositions ?? 10;
  const positions: CarryPosition[] = [];

  for (const pos of state.positions) {
    const perp = perps.find((p) => p.venue === pos.perpVenue && p.base === pos.base);
    const spotQ = spot.find((q) => q.venue === pos.spotVenue && q.base === pos.base && (q.quote === "USDT" || q.quote === "USDC"));
    const long = pos.direction === "long-spot-short-perp";
    const heldHours = (opts.now - pos.openedAt) / 3_600_000;

    if (!perp || !spotQ) {
      records.push(closeRecord(pos, opts.now, "market-gone", heldHours, pos.accruedFunding, 0));
      continue;
    }
    // Funding accrues to the short side when positive. Pro-rata over elapsed hours.
    const hours = Math.max(0, (opts.now - pos.lastMarkAt) / 3_600_000);
    const signed = long ? perp.fundingRate : -perp.fundingRate;
    const accrued = signed * (hours / pos.fundingIntervalHours) * pos.notionalQuote;
    const spotExit = long ? spotQ.bid : spotQ.ask;
    const perpExit = long ? perp.ask : perp.bid;
    const spotLeg = (spotExit / pos.entrySpot - 1) * pos.notionalQuote * (long ? 1 : -1);
    const perpLeg = (perpExit / pos.entryPerp - 1) * pos.notionalQuote * (long ? -1 : 1);
    const legPnl = round2(spotLeg + perpLeg);
    const next: CarryPosition = {
      ...pos,
      accruedFunding: round2(pos.accruedFunding + accrued),
      lastMarkAt: opts.now,
      lastFundingRate: perp.fundingRate,
      adverseMarks: signed < 0 ? pos.adverseMarks + 1 : 0,
    };
    const mark: CarryMarkRecord = { type: "carry-mark", t: opts.now, id: pos.id, fundingRate: perp.fundingRate, accruedFunding: next.accruedFunding, legPnl };
    records.push(mark);

    if (heldHours >= opts.holdDays * 24) records.push(closeRecord(next, opts.now, "hold-expired", heldHours, next.accruedFunding, legPnl));
    else if (next.adverseMarks >= maxAdverse) records.push(closeRecord(next, opts.now, "funding-flipped", heldHours, next.accruedFunding, legPnl));
    else positions.push(next);
  }

  // Open new positions from the best current carry rows.
  for (const b of basis) {
    if (positions.length >= maxPositions) break;
    if (b.netAprPct < opts.minNetAprPct) continue;
    if (opts.longOnly !== false && b.direction !== "long-spot-short-perp") continue;
    if (positions.some((p) => p.base === b.base && p.perpVenue === b.perpVenue)) continue;
    const pos: CarryPosition = {
      id: createHash("sha1").update(`carry|${b.base}|${b.spotVenue}|${b.perpVenue}|${opts.now}`).digest("hex").slice(0, 12),
      base: b.base,
      spotVenue: b.spotVenue,
      perpVenue: b.perpVenue,
      direction: b.direction,
      notionalQuote: opts.notionalQuote,
      openedAt: opts.now,
      entrySpot: b.spotPrice,
      entryPerp: b.perpPrice,
      entryFundingRate: b.fundingRate,
      fundingIntervalHours: b.fundingIntervalHours,
      roundTripFeesBps: b.roundTripFeesBps,
      accruedFunding: 0,
      lastMarkAt: opts.now,
      lastFundingRate: b.fundingRate,
      adverseMarks: 0,
    };
    positions.push(pos);
    const rec: CarryOpenRecord = { type: "carry-open", t: opts.now, position: pos };
    records.push(rec);
  }

  return {
    state: { ...state, positions, runs: state.runs + 1, firstRunAt: state.firstRunAt ?? opts.now, lastRunAt: opts.now },
    records,
  };
}

function closeRecord(pos: CarryPosition, t: number, reason: CarryCloseRecord["reason"], heldHours: number, funding: number, legPnl: number): CarryCloseRecord {
  const feesQuote = round2((pos.roundTripFeesBps / 10_000) * pos.notionalQuote);
  return {
    type: "carry-close",
    t,
    id: pos.id,
    base: pos.base,
    spotVenue: pos.spotVenue,
    perpVenue: pos.perpVenue,
    reason,
    heldHours: round2(heldHours),
    fundingQuote: round2(funding),
    legPnl: round2(legPnl),
    feesQuote,
    pnlQuote: round2(funding + legPnl - feesQuote),
  };
}
