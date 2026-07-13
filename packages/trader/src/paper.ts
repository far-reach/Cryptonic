import type { Balances, Exchange, Kline, Order, OrderRequest, SymbolRules } from "./types.js";

/**
 * In-memory exchange used for paper trading and backtests. Limit orders fill
 * when the observed price range crosses them (candle high/low in backtests,
 * last trade price in live-paper mode). Fees are charged in quote at
 * `feeRate` per fill, matching Binance spot's standard 0.1%.
 */
export class PaperExchange implements Exchange {
  private price = 0;
  private time = 0;
  private nextId = 1;
  private open = new Map<string, Order>();
  private done: Order[] = [];
  private quote: number;
  private base = 0;

  constructor(
    readonly rules: SymbolRules,
    private readonly feeRate: number,
    startQuote: number,
  ) {
    this.quote = startQuote;
  }

  /** Live-paper mode: observe a single trade price. */
  setPrice(price: number, ts: number): void {
    this.applyRange(price, price, price, ts);
  }

  /** Backtest mode: sweep a whole candle. Fills at the limit price. */
  applyCandle(k: Kline): void {
    this.applyRange(k.low, k.high, k.close, k.closeTime);
  }

  private applyRange(low: number, high: number, close: number, ts: number): void {
    this.price = close;
    this.time = ts;
    for (const order of [...this.open.values()]) {
      const crossed =
        order.side === "BUY" ? low <= order.price : high >= order.price;
      if (crossed) this.fill(order, order.price, ts);
    }
  }

  private fill(order: Order, atPrice: number, ts: number): void {
    const quoteAmt = atPrice * order.qty;
    const fee = quoteAmt * this.feeRate;
    if (order.side === "BUY") {
      this.base += order.qty; // quote was already escrowed at placement
      // refund escrow difference if filled below the escrowed limit price
      this.quote += order.price * order.qty - quoteAmt - fee;
    } else {
      this.quote += quoteAmt - fee; // base was escrowed at placement
    }
    order.status = "FILLED";
    order.executedQty = order.qty;
    order.executedQuote = quoteAmt;
    order.feeQuote = fee;
    order.updatedAt = ts;
    this.open.delete(order.orderId);
    this.done.push(order);
  }

  async lastPrice(): Promise<number> {
    return this.price;
  }

  async balances(): Promise<Balances> {
    let lockedQuote = 0;
    let lockedBase = 0;
    for (const o of this.open.values()) {
      if (o.side === "BUY") lockedQuote += o.price * o.qty;
      else lockedBase += o.qty;
    }
    return { quote: this.quote, base: this.base, lockedQuote, lockedBase };
  }

  async openOrders(): Promise<Order[]> {
    return [...this.open.values()];
  }

  async drainFills(): Promise<Order[]> {
    const out = this.done;
    this.done = [];
    return out;
  }

  async placeLimit(req: OrderRequest): Promise<Order> {
    if (req.qty <= 0 || req.price <= 0) throw new Error("invalid order");
    const escrow = req.side === "BUY" ? req.price * req.qty : 0;
    if (req.side === "BUY" && this.quote < escrow * (1 + this.feeRate))
      throw new Error(`insufficient quote: need ${escrow.toFixed(2)}, have ${this.quote.toFixed(2)}`);
    if (req.side === "SELL" && this.base < req.qty)
      throw new Error(`insufficient base: need ${req.qty}, have ${this.base}`);
    if (req.side === "BUY") this.quote -= escrow;
    else this.base -= req.qty;
    const order: Order = {
      ...req,
      orderId: String(this.nextId++),
      status: "NEW",
      executedQty: 0,
      executedQuote: 0,
      feeQuote: 0,
      createdAt: this.time,
      updatedAt: this.time,
    };
    this.open.set(order.orderId, order);
    return order;
  }

  async cancel(orderId: string): Promise<void> {
    const order = this.open.get(orderId);
    if (!order) return;
    if (order.side === "BUY") this.quote += order.price * order.qty;
    else this.base += order.qty;
    order.status = "CANCELED";
    order.updatedAt = this.time;
    this.open.delete(orderId);
    this.done.push(order);
  }

  async cancelAll(): Promise<void> {
    for (const id of [...this.open.keys()]) await this.cancel(id);
  }

  async marketSell(qty: number): Promise<Order> {
    const sellQty = Math.min(qty, this.base);
    const quoteAmt = this.price * sellQty;
    const fee = quoteAmt * this.feeRate;
    this.base -= sellQty;
    this.quote += quoteAmt - fee;
    const order: Order = {
      symbol: "PAPER",
      side: "SELL",
      price: this.price,
      qty: sellQty,
      clientId: "market-sell",
      orderId: String(this.nextId++),
      status: "FILLED",
      executedQty: sellQty,
      executedQuote: quoteAmt,
      feeQuote: fee,
      createdAt: this.time,
      updatedAt: this.time,
    };
    return order;
  }
}
