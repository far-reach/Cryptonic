import type { BasisOpportunity, CrossExchangeOpportunity, TriangularOpportunity, Venue } from "../types.js";

/**
 * Append-only ledger of what the scanner saw and what would have happened had
 * it traded. Every record carries `t` (ms) and `type`; the ledger is JSON lines
 * so it can be committed by a scheduled job and replayed later.
 */
export type LedgerRecord = DetectRecord | VerifyRecord | CarryOpenRecord | CarryMarkRecord | CarryCloseRecord | RunRecord;

export interface RunRecord {
  type: "run";
  t: number;
  /** Spot quote counts per venue, so a venue going dark is visible in the history. */
  quoteCounts: Record<string, number>;
  errors: string[];
}

export interface DetectRecord {
  type: "detect";
  t: number;
  /** Stable id (hash of kind + market + venues + t) so verify records can reference it. */
  id: string;
  opportunity: CrossExchangeOpportunity | TriangularOpportunity;
}

/** What the same trade would have realised when re-priced `delayMs` after detection. */
export interface VerifyRecord {
  type: "verify";
  t: number;
  id: string;
  kind: "cross-exchange" | "triangular";
  label: string;
  venues: Venue[];
  delayMs: number;
  notionalQuote: number;
  expectedNetBps: number;
  /** Net edge at the later prices; null when a leg could no longer be priced (market gone). */
  realisedNetBps: number | null;
  /** Quote-currency P&L of a full-size fill at the later prices, net of fees. */
  pnlQuote: number;
  survived: boolean;
}

export interface CarryPosition {
  id: string;
  base: string;
  spotVenue: Venue;
  perpVenue: Venue;
  direction: BasisOpportunity["direction"];
  notionalQuote: number;
  openedAt: number;
  entrySpot: number;
  entryPerp: number;
  entryFundingRate: number;
  fundingIntervalHours: number;
  roundTripFeesBps: number;
  /** Funding accrued so far, quote currency. */
  accruedFunding: number;
  lastMarkAt: number;
  lastFundingRate: number;
  /** Consecutive marks where funding ran against the position. */
  adverseMarks: number;
}

export interface CarryOpenRecord {
  type: "carry-open";
  t: number;
  position: CarryPosition;
}

export interface CarryMarkRecord {
  type: "carry-mark";
  t: number;
  id: string;
  fundingRate: number;
  accruedFunding: number;
  /** Mark-to-market P&L of both legs excluding funding and fees, quote currency. */
  legPnl: number;
}

export interface CarryCloseRecord {
  type: "carry-close";
  t: number;
  id: string;
  base: string;
  spotVenue: Venue;
  perpVenue: Venue;
  reason: "hold-expired" | "funding-flipped" | "market-gone" | "manual";
  heldHours: number;
  fundingQuote: number;
  legPnl: number;
  feesQuote: number;
  pnlQuote: number;
}

/** Persistent state between runs (open positions + counters). */
export interface PaperState {
  version: 1;
  positions: CarryPosition[];
  runs: number;
  firstRunAt: number | null;
  lastRunAt: number | null;
}

export const emptyState = (): PaperState => ({ version: 1, positions: [], runs: 0, firstRunAt: null, lastRunAt: null });
