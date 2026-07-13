import type { Exchange, Order } from "./types.js";
import type { TraderConfig } from "./config.js";
import { GridStrategy, type Slot } from "./strategy/grid.js";
import { RiskManager } from "./risk.js";
import type { BotState } from "./state.js";

export interface TickReport {
  ts: number;
  price: number;
  action: "TRADE" | "PAUSE_BUYS" | "EMERGENCY_STOP";
  placed: number;
  fills: number;
  realizedQuote: number;
  equityQuote: number;
}

export type Logger = (msg: string) => void;

/**
 * The engine shared by live, paper and backtest modes: one `tick()` observes
 * fills, applies risk rules, and reconciles the exchange's open orders with
 * what the grid strategy wants. All exchange access goes through the
 * `Exchange` interface, so the only difference between modes is which
 * implementation is plugged in.
 */
export class GridBot {
  readonly strategy: GridStrategy;
  readonly risk: RiskManager;
  slots: Slot[];
  realizedQuote = 0;
  feesQuote = 0;
  trades = 0;
  roundTrips = 0;
  readonly startedAt: number;

  constructor(
    readonly cfg: TraderConfig,
    readonly exchange: Exchange,
    private readonly log: Logger = () => {},
    resume?: BotState,
  ) {
    this.strategy = new GridStrategy(cfg.symbol, cfg.grid, cfg.risk, exchange.rules);
    this.risk = new RiskManager(cfg.risk, cfg.grid.lower);
    this.slots = resume?.slots ?? this.strategy.newSlots();
    this.startedAt = resume?.startedAt ?? Date.now();
    if (resume) {
      this.realizedQuote = resume.realizedQuote;
      this.feesQuote = resume.feesQuote;
      this.trades = resume.trades;
      this.roundTrips = resume.roundTrips ?? 0;
      this.risk.restore(resume.risk.day, resume.risk.realizedToday, resume.risk.stopped);
    }
  }

  async tick(ts: number): Promise<TickReport> {
    const price = await this.exchange.lastPrice();

    // 1. Absorb terminal orders (fills/cancels) since the last tick.
    const fills = await this.exchange.drainFills();
    for (const order of fills) this.applyFill(order, ts);

    // 2. Risk gate (hard stop sees realized PnL + inventory marked to market).
    const inv = this.strategy.inventory(this.slots);
    const totalPnl = this.realizedQuote + (inv.qty * price - inv.costQuote);
    const verdict = this.risk.check(price, ts, totalPnl);
    if (verdict.action === "EMERGENCY_STOP") {
      await this.emergencyStop(verdict.reason, ts);
      return this.report(ts, price, "EMERGENCY_STOP", 0, fills.length);
    }

    // 3. Reconcile: place any order the strategy wants that isn't live.
    const openIds = new Set((await this.exchange.openOrders()).map((o) => o.clientId));
    const wanted = this.strategy.desiredOrders(this.slots, price, verdict.action === "TRADE");
    let placed = 0;
    for (const req of wanted) {
      if (openIds.has(req.clientId)) continue;
      try {
        const order = await this.exchange.placeLimit(req);
        this.strategy.onPlaced(this.slots, order);
        placed++;
      } catch (err) {
        this.log(`place ${req.clientId} failed: ${(err as Error).message}`);
      }
    }

    return this.report(ts, price, verdict.action, placed, fills.length);
  }

  private applyFill(order: Order, ts: number): void {
    const { realizedQuote } = this.strategy.onFill(this.slots, order);
    if (order.status === "FILLED") {
      this.trades++;
      this.feesQuote += order.feeQuote;
      if (realizedQuote !== 0) {
        this.roundTrips++;
        this.realizedQuote += realizedQuote;
        this.risk.recordRealized(realizedQuote, ts);
        this.log(
          `round-trip ${order.clientId}: ${realizedQuote >= 0 ? "+" : ""}${realizedQuote.toFixed(4)} ${this.cfg.quoteAsset}`,
        );
      }
    }
  }

  /** Cancel everything, liquidate bot inventory, halt until human restart. */
  private async emergencyStop(reason: string, ts: number): Promise<void> {
    this.log(`EMERGENCY STOP: ${reason}`);
    await this.exchange.cancelAll();
    for (const order of await this.exchange.drainFills()) this.applyFill(order, ts);
    const { qty, costQuote } = this.strategy.inventory(this.slots);
    if (qty > 0) {
      const sale = await this.exchange.marketSell(qty);
      const realized = sale.executedQuote - sale.feeQuote - costQuote;
      this.realizedQuote += realized;
      this.feesQuote += sale.feeQuote;
      this.risk.recordRealized(realized, ts);
      for (const slot of this.slots) {
        slot.state = "EMPTY";
        slot.qty = 0;
        slot.costQuote = 0;
        slot.orderId = undefined;
      }
      this.log(`liquidated ${qty} ${this.cfg.baseAsset} (${realized.toFixed(2)} ${this.cfg.quoteAsset} realized)`);
    }
  }

  private async report(
    ts: number,
    price: number,
    action: TickReport["action"],
    placed: number,
    fills: number,
  ): Promise<TickReport> {
    const bal = await this.exchange.balances();
    return {
      ts,
      price,
      action,
      placed,
      fills,
      realizedQuote: this.realizedQuote,
      equityQuote: bal.quote + bal.lockedQuote + (bal.base + bal.lockedBase) * price,
    };
  }

  snapshot(): BotState {
    return {
      symbol: this.cfg.symbol,
      gridLower: this.cfg.grid.lower,
      gridUpper: this.cfg.grid.upper,
      slots: this.slots,
      realizedQuote: this.realizedQuote,
      feesQuote: this.feesQuote,
      trades: this.trades,
      roundTrips: this.roundTrips,
      risk: this.risk.snapshot(),
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    };
  }
}
