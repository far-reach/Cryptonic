import type { Order, OrderRequest, SymbolRules } from "../types.js";
import type { GridConfig, RiskConfig } from "../config.js";
import { floorToStep, gridLevels, roundToStep } from "../util.js";

/**
 * Spot grid strategy ("buy low in the range, sell one level higher").
 *
 * The price range [lower, upper] is divided into `levels-1` slots. Each slot
 * owns an equal share of the tradable budget and is always in one of four
 * states. A slot buys at its lower level and sells the same lot at its upper
 * level, so every completed round-trip realizes (one grid step - two fees)
 * of profit. Buys are only ever placed below the current price — the bot
 * never market-buys, never uses leverage, and can never deploy more quote
 * than `levels-1` slots' worth (the hard budget cap).
 */
export type SlotState = "EMPTY" | "PENDING_BUY" | "HOLDING" | "PENDING_SELL";

export interface Slot {
  /** Slot i buys at level[i] and sells at level[i+1]. */
  index: number;
  state: SlotState;
  /** Base quantity held by this slot (HOLDING / PENDING_SELL). */
  qty: number;
  /** Quote spent to acquire `qty`, fees included. */
  costQuote: number;
  /** Exchange order id of the live order for PENDING_* states. */
  orderId?: string;
}

export interface FillResult {
  /** Realized profit in quote from this fill (non-zero only for sells). */
  realizedQuote: number;
}

const CLIENT_ID = /^grid-(buy|sell)-(\d+)$/;

export class GridStrategy {
  readonly levels: number[];
  readonly perSlotQuote: number;

  constructor(
    readonly symbol: string,
    grid: GridConfig,
    risk: RiskConfig,
    readonly rules: SymbolRules,
  ) {
    this.levels = gridLevels(grid.lower, grid.upper, grid.levels);
    const tradable = risk.budgetQuote * (1 - risk.reserveFraction);
    this.perSlotQuote = tradable / (grid.levels - 1);
  }

  newSlots(): Slot[] {
    return this.levels.slice(0, -1).map((_, i) => ({
      index: i,
      state: "EMPTY" as SlotState,
      qty: 0,
      costQuote: 0,
    }));
  }

  /**
   * Orders that should exist right now but don't. EMPTY slots whose buy level
   * is below the current price get a buy; HOLDING slots get their sell.
   * `allowNewBuys=false` (daily loss pause) still lets sells through, since
   * sells only reduce exposure.
   */
  desiredOrders(slots: Slot[], price: number, allowNewBuys = true): OrderRequest[] {
    const out: OrderRequest[] = [];
    for (const slot of slots) {
      if (slot.state === "EMPTY" && allowNewBuys) {
        const level = this.levels[slot.index];
        // Only rest buys strictly below market so we never cross the book.
        if (level < price * 0.999) {
          const req = this.buyOrder(slot.index);
          if (req) out.push(req);
        }
      } else if (slot.state === "HOLDING") {
        out.push(this.sellOrder(slot.index, slot.qty));
      }
    }
    return out;
  }

  private buyOrder(slotIndex: number): OrderRequest | undefined {
    const price = roundToStep(this.levels[slotIndex], this.rules.tickSize);
    const qty = floorToStep(this.perSlotQuote / price, this.rules.stepSize);
    if (qty <= 0 || price * qty < this.rules.minNotional) return undefined;
    return { symbol: this.symbol, side: "BUY", price, qty, clientId: `grid-buy-${slotIndex}` };
  }

  private sellOrder(slotIndex: number, qty: number): OrderRequest {
    const price = roundToStep(this.levels[slotIndex + 1], this.rules.tickSize);
    const sellQty = floorToStep(qty, this.rules.stepSize);
    return {
      symbol: this.symbol,
      side: "SELL",
      price,
      qty: sellQty,
      clientId: `grid-sell-${slotIndex}`,
    };
  }

  /** Mark a slot as having a live order (called right after placement). */
  onPlaced(slots: Slot[], order: Order): void {
    const slot = this.slotOf(slots, order.clientId);
    if (!slot) return;
    slot.orderId = order.orderId;
    slot.state = order.side === "BUY" ? "PENDING_BUY" : "PENDING_SELL";
  }

  /** Advance slot state on a terminal order and return realized PnL. */
  onFill(slots: Slot[], order: Order): FillResult {
    const slot = this.slotOf(slots, order.clientId);
    if (!slot) return { realizedQuote: 0 };

    if (order.status === "CANCELED") {
      // Return the slot to the state that re-creates the order next tick.
      slot.state = order.side === "BUY" ? "EMPTY" : "HOLDING";
      slot.orderId = undefined;
      return { realizedQuote: 0 };
    }

    if (order.side === "BUY") {
      slot.state = "HOLDING";
      slot.qty = order.executedQty;
      slot.costQuote = order.executedQuote + order.feeQuote;
      slot.orderId = undefined;
      return { realizedQuote: 0 };
    }

    // SELL filled: round-trip complete, slot becomes free again.
    const realized = order.executedQuote - order.feeQuote - slot.costQuote;
    slot.state = "EMPTY";
    slot.qty = 0;
    slot.costQuote = 0;
    slot.orderId = undefined;
    return { realizedQuote: realized };
  }

  /** Total base inventory currently held across slots. */
  inventory(slots: Slot[]): { qty: number; costQuote: number } {
    let qty = 0;
    let costQuote = 0;
    for (const s of slots) {
      qty += s.qty;
      costQuote += s.costQuote;
    }
    return { qty, costQuote };
  }

  private slotOf(slots: Slot[], clientId: string): Slot | undefined {
    const m = CLIENT_ID.exec(clientId);
    if (!m) return undefined;
    return slots[Number(m[2])];
  }
}
