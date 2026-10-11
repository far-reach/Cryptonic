import type { FetchLike, Venue } from "../types.js";

export interface Credentials {
  apiKey: string;
  apiSecret: string;
  /** Bitget and OKX require a passphrase; ignored elsewhere. */
  passphrase?: string;
}

export interface OrderRequest {
  venue: Venue;
  base: string;
  quote: string;
  side: "buy" | "sell";
  /** Limit price in quote per base. Orders are always immediate-or-cancel limits: never a bare market order. */
  price: number;
  /** Base units. */
  amountBase: number;
  clientOrderId: string;
}

export interface OrderResult {
  venue: Venue;
  orderId: string;
  status: "filled" | "partial" | "cancelled" | "rejected" | "unknown";
  filledBase: number;
  filledQuote: number;
  avgPrice: number;
  /** Fee in quote currency when the venue reports it; otherwise estimated by the caller. */
  feeQuote?: number;
  raw?: unknown;
}

export interface Balance {
  asset: string;
  available: number;
}

export interface SymbolRules {
  /** Quantity step (base units); 0.01 means two decimals. */
  lotStep: number;
  /** Price step. */
  tickSize: number;
  /** Minimum order notional in quote units (0 when the venue doesn't publish one). */
  minNotional: number;
}

/** What a signed HTTP call looks like before it is sent; pure so it can be tested without a network. */
export interface SignedRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ExchangeClient {
  venue: Venue;
  /** Build the signed request for placing an order (no I/O). */
  signPlaceOrder(req: OrderRequest, nowMs: number): SignedRequest;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  /** Fetch an order's final state (IOC orders settle immediately, but some venues answer the placement call before fills are attached). */
  getOrder(req: OrderRequest, orderId: string): Promise<OrderResult>;
  getBalance(asset: string): Promise<Balance>;
  getSymbolRules(base: string, quote: string): Promise<SymbolRules>;
}

export interface ClientOptions {
  fetchFn?: FetchLike;
  apiBase?: string;
  now?: () => number;
}

/** Hard limits the executor enforces before it sends anything. */
export interface RiskLimits {
  /** Max quote notional per leg. */
  maxNotionalQuote: number;
  /** Refuse opportunities below this expected net edge. */
  minNetBps: number;
  /** Price tolerance applied to the IOC limit (bps beyond the quoted ask/bid). */
  slippageToleranceBps: number;
  /** Stop trading for the day once realised losses exceed this (quote units). */
  maxDailyLossQuote: number;
  /** Halt when the unhedged base leftover after a round exceeds this fraction of the intended size. */
  maxUnhedgedFraction: number;
}

export const DEFAULT_RISK: RiskLimits = {
  maxNotionalQuote: 200,
  minNetBps: 5,
  slippageToleranceBps: 3,
  maxDailyLossQuote: 20,
  maxUnhedgedFraction: 0.1,
};
