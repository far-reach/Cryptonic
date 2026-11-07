import type { FetchLike, OrderBook, PerpQuote, Quote, Venue, WithdrawalCost } from "../types.js";
import { fetchBinanceOrderBook, fetchBinancePerpQuotes, fetchBinanceSpotQuotes } from "./binance.js";
import { fetchBitgetOrderBook, fetchBitgetPerpQuotes, fetchBitgetSpotQuotes, fetchBitgetWithdrawals } from "./bitget.js";
import { fetchBybitOrderBook, fetchBybitPerpQuotes, fetchBybitSpotQuotes } from "./bybit.js";
import { fetchOkxOrderBook, fetchOkxPerpQuotes, fetchOkxSpotQuotes } from "./okx.js";

export interface VenueAdapter {
  spot(fetchFn: FetchLike): Promise<Quote[]>;
  perps(fetchFn: FetchLike): Promise<PerpQuote[]>;
  orderBook(base: string, quote: string, fetchFn: FetchLike, limit?: number): Promise<OrderBook>;
  /** Live withdrawal fee table, when the venue publishes one without auth. */
  withdrawals?(fetchFn: FetchLike): Promise<Record<string, WithdrawalCost>>;
}

export const ADAPTERS: Record<Venue, VenueAdapter> = {
  bitget: {
    spot: (f) => fetchBitgetSpotQuotes(f),
    perps: (f) => fetchBitgetPerpQuotes(f),
    orderBook: (b, q, f, l) => fetchBitgetOrderBook(b, q, f, undefined, l),
    withdrawals: (f) => fetchBitgetWithdrawals(f),
  },
  binance: {
    spot: (f) => fetchBinanceSpotQuotes(f),
    perps: (f) => fetchBinancePerpQuotes(f),
    orderBook: (b, q, f, l) => fetchBinanceOrderBook(b, q, f, undefined, l),
  },
  bybit: {
    spot: (f) => fetchBybitSpotQuotes(f),
    perps: (f) => fetchBybitPerpQuotes(f),
    orderBook: (b, q, f, l) => fetchBybitOrderBook(b, q, f, undefined, l),
  },
  okx: {
    spot: (f) => fetchOkxSpotQuotes(f),
    perps: (f) => fetchOkxPerpQuotes(f),
    orderBook: (b, q, f, l) => fetchOkxOrderBook(b, q, f, undefined, l),
  },
};

export * from "./bitget.js";
export * from "./binance.js";
export * from "./bybit.js";
export * from "./okx.js";
