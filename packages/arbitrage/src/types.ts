/** Venues the scanner knows how to read. All adapters use public, unauthenticated endpoints. */
export const VENUES = ["bitget", "binance", "bybit", "okx"] as const;
export type Venue = (typeof VENUES)[number];

/** Top-of-book quote for one spot market, normalised across venues. Prices are in `quote` per `base`. */
export interface Quote {
  venue: Venue;
  base: string;
  quote: string;
  /** Best bid (what you receive when selling at market). */
  bid: number;
  /** Best ask (what you pay when buying at market). */
  ask: number;
  /** Size resting at the best bid / ask, in base units. 0 when the venue doesn't publish it. */
  bidSize: number;
  askSize: number;
  /** Venue timestamp in ms (or fetch time when the venue doesn't publish one). */
  ts: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

/** Order-book snapshot, both sides sorted best-first. */
export interface OrderBook {
  venue: Venue;
  base: string;
  quote: string;
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
}

/** Top-of-book + funding data for a USDT-margined perpetual. */
export interface PerpQuote {
  venue: Venue;
  base: string;
  quote: string;
  bid: number;
  ask: number;
  markPrice?: number;
  indexPrice?: number;
  /** Funding rate per interval as a fraction (0.0001 = 0.01%). Positive: longs pay shorts. */
  fundingRate: number;
  /** Hours between funding settlements (8 on most venues, 4 or 1 on some contracts). */
  fundingIntervalHours: number;
  nextFundingTime?: number;
  ts: number;
}

/** Fees in basis points (1 bp = 0.01%). Taker fees are what a market order pays. */
export interface VenueFees {
  spotTakerBps: number;
  spotMakerBps: number;
  perpTakerBps: number;
  perpMakerBps: number;
}

/** Cost of moving `coin` off a venue: flat fee in coin units plus a typical wall-clock delay. */
export interface WithdrawalCost {
  fee: number;
  minutes: number;
}

export type FeeTable = Record<Venue, VenueFees>;
export type WithdrawalTable = Partial<Record<Venue, Record<string, WithdrawalCost>>>;

/** Buy on one venue, sell the same asset on another. */
export interface CrossExchangeOpportunity {
  kind: "cross-exchange";
  base: string;
  quote: string;
  buyVenue: Venue;
  sellVenue: Venue;
  /** Effective buy price (best ask, or depth-weighted average when an order book was used). */
  buyPrice: number;
  /** Effective sell price (best bid, or depth-weighted). */
  sellPrice: number;
  /** Quote-currency notional the numbers below are computed for. */
  notionalQuote: number;
  /** Largest notional fillable at the quoted prices (top-of-book sizes or book depth). */
  maxNotionalQuote: number;
  grossBps: number;
  feesBps: number;
  /** Net edge assuming balances are pre-funded on both venues (no transfer needed). */
  netBps: number;
  /** Net edge after paying to withdraw the asset from the buy venue (undefined when unknown). */
  netAfterTransferBps?: number;
  transferMinutes?: number;
  /** True when the gap is so large it is more likely a symbol collision / halted market than an edge. */
  suspicious: boolean;
  /** True when prices came from full order books rather than top-of-book quotes. */
  depthChecked: boolean;
  quoteAgeMs: number;
}

export interface TriangularLeg {
  /** Market traded, e.g. "ETH/USDT". */
  pair: string;
  side: "buy" | "sell";
  /** Price used for the leg (ask for buys, bid for sells). */
  price: number;
}

/** A → B → C → A on a single venue. */
export interface TriangularOpportunity {
  kind: "triangular";
  venue: Venue;
  /** Currency path, first == last, e.g. ["USDT","ETH","BTC","USDT"]. */
  path: string[];
  legs: TriangularLeg[];
  grossBps: number;
  feesBps: number;
  netBps: number;
  /** Largest start-currency notional fillable at top-of-book across all legs. */
  maxNotionalStart: number;
}

/** Spot vs perpetual carry: hold spot, short the perp (or the reverse) and collect funding. */
export interface BasisOpportunity {
  kind: "basis";
  base: string;
  spotVenue: Venue;
  perpVenue: Venue;
  direction: "long-spot-short-perp" | "short-spot-long-perp";
  spotPrice: number;
  perpPrice: number;
  /** (perp − spot) / spot in bps; positive = contango. */
  basisBps: number;
  fundingRate: number;
  fundingIntervalHours: number;
  /** Gross funding yield annualised, in percent. */
  fundingAprPct: number;
  /** Round-trip taker fees on both legs, in bps of notional. */
  roundTripFeesBps: number;
  /** Hours of funding at the current rate needed to pay back the round-trip fees. */
  breakevenHours: number;
  /** APR after amortising fees over `holdDays`, in percent. */
  netAprPct: number;
  holdDays: number;
}

/** Long the perp where funding is low, short it where funding is high; delta-neutral. */
export interface FundingSpreadOpportunity {
  kind: "funding-spread";
  base: string;
  longVenue: Venue;
  shortVenue: Venue;
  longFundingRate: number;
  shortFundingRate: number;
  /** Per-interval funding differential (short venue − long venue), fraction. */
  spread: number;
  fundingIntervalHours: number;
  spreadAprPct: number;
  roundTripFeesBps: number;
  netAprPct: number;
  holdDays: number;
}

export type Opportunity =
  | CrossExchangeOpportunity
  | TriangularOpportunity
  | BasisOpportunity
  | FundingSpreadOpportunity;

export interface ScanResult {
  generatedAt: number;
  /** Number of spot quotes read per venue (0 = venue failed or disabled). */
  quoteCounts: Record<string, number>;
  perpCounts: Record<string, number>;
  crossExchange: CrossExchangeOpportunity[];
  triangular: TriangularOpportunity[];
  basis: BasisOpportunity[];
  fundingSpread: FundingSpreadOpportunity[];
  /** Candidates rejected as suspicious (symbol collisions, halted markets). Shown separately. */
  suspicious: CrossExchangeOpportunity[];
  errors: string[];
  params: {
    notionalQuote: number;
    minNetBps: number;
    holdDays: number;
    quotes: string[];
  };
}

/** Minimal fetch signature so tests and callers can inject a mock. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const bps = (fraction: number): number => fraction * 10_000;
export const round2 = (n: number): number => Math.round(n * 100) / 100;
