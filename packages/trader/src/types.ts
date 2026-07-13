/** Shared types for the Cryptonic autotrader. */

export type Side = "BUY" | "SELL";

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  /** Limit price in quote currency (USDT). */
  price: number;
  /** Quantity in base currency (e.g. BTC). */
  qty: number;
  /** Free-form tag so the strategy can map fills back to grid levels. */
  clientId: string;
}

export type OrderStatus = "NEW" | "FILLED" | "CANCELED";

export interface Order extends OrderRequest {
  orderId: string;
  status: OrderStatus;
  /** Base quantity actually executed so far. */
  executedQty: number;
  /** Quote spent/received for the executed part, fees not included. */
  executedQuote: number;
  /** Fee charged in quote currency (sells; paper/backtest models all fees here). */
  feeQuote: number;
  /**
   * Fee charged in BASE currency (spot buys usually pay fees in the asset
   * bought). The strategy must sell executedQty - feeBase, or sells bounce
   * with "insufficient balance".
   */
  feeBase?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Balances {
  /** Free quote (USDT) available to the bot. */
  quote: number;
  /** Free base (e.g. BTC) available to the bot. */
  base: number;
  /** Quote escrowed in resting buy orders. */
  lockedQuote: number;
  /** Base escrowed in resting sell orders. */
  lockedBase: number;
}

/** Exchange trading rules for one symbol (from /exchangeInfo filters). */
export interface SymbolRules {
  /** Price must be a multiple of this (PRICE_FILTER.tickSize). */
  tickSize: number;
  /** Quantity must be a multiple of this (LOT_SIZE.stepSize). */
  stepSize: number;
  /** price*qty must be at least this (NOTIONAL.minNotional). */
  minNotional: number;
}

/**
 * The minimal exchange surface the bot needs. Implemented by the live
 * Binance client and by the paper/backtest simulator, so the strategy and
 * risk code are identical in every mode.
 */
export interface Exchange {
  readonly rules: SymbolRules;
  lastPrice(): Promise<number>;
  balances(): Promise<Balances>;
  openOrders(): Promise<Order[]>;
  /** Orders that reached a terminal state since the previous call. */
  drainFills(): Promise<Order[]>;
  placeLimit(req: OrderRequest): Promise<Order>;
  cancel(orderId: string): Promise<void>;
  cancelAll(): Promise<void>;
  /** Immediate sell of `qty` base at market (used only by the safety stop). */
  marketSell(qty: number): Promise<Order>;
}
