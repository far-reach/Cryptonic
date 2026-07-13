import { describe, expect, it } from "vitest";
import { GridStrategy } from "../src/strategy/grid.js";
import { gridLevels, floorToStep, roundToStep } from "../src/util.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { DEFAULT_RULES } from "../src/backtest.js";
import type { Order } from "../src/types.js";

const mkStrategy = () =>
  new GridStrategy(
    "BTCUSDT",
    { lower: 60_000, upper: 70_000, levels: 11 },
    DEFAULT_CONFIG.risk,
    DEFAULT_RULES,
  );

const filled = (req: { clientId: string; side: "BUY" | "SELL"; price: number; qty: number }): Order => ({
  symbol: "BTCUSDT",
  side: req.side,
  price: req.price,
  qty: req.qty,
  clientId: req.clientId,
  orderId: "1",
  status: "FILLED",
  executedQty: req.qty,
  executedQuote: req.price * req.qty,
  feeQuote: req.price * req.qty * 0.001,
  createdAt: 0,
  updatedAt: 0,
});

describe("gridLevels", () => {
  it("spaces levels geometrically from lower to upper", () => {
    const levels = gridLevels(60_000, 70_000, 11);
    expect(levels).toHaveLength(11);
    expect(levels[0]).toBeCloseTo(60_000, 6);
    expect(levels[10]).toBeCloseTo(70_000, 6);
    const r0 = levels[1] / levels[0];
    const r9 = levels[10] / levels[9];
    expect(r0).toBeCloseTo(r9, 10);
  });

  it("rejects degenerate ranges", () => {
    expect(() => gridLevels(70_000, 60_000, 5)).toThrow();
    expect(() => gridLevels(0, 60_000, 5)).toThrow();
    expect(() => gridLevels(1, 2, 1)).toThrow();
  });
});

describe("step rounding", () => {
  it("floors quantities without float dust", () => {
    expect(floorToStep(0.00034567, 0.00001)).toBe(0.00034);
    expect(floorToStep(1.0000000001, 0.001)).toBe(1);
  });
  it("rounds prices to tick", () => {
    expect(roundToStep(64_123.456, 0.01)).toBe(64_123.46);
  });
});

describe("GridStrategy", () => {
  it("only places buys strictly below the current price", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const wanted = s.desiredOrders(slots, 65_000);
    expect(wanted.every((o) => o.side === "BUY")).toBe(true);
    expect(wanted.every((o) => o.price < 65_000)).toBe(true);
    // levels strictly below 65k*0.999: 60000..~64806 -> indexes 0..5
    expect(wanted).toHaveLength(6);
  });

  it("keeps every order above minNotional and inside the budget", () => {
    const s = mkStrategy();
    const wanted = s.desiredOrders(s.newSlots(), 100_000); // all 10 slots below price
    expect(wanted).toHaveLength(10);
    let total = 0;
    for (const o of wanted) {
      const notional = o.price * o.qty;
      expect(notional).toBeGreaterThanOrEqual(DEFAULT_RULES.minNotional);
      expect(notional).toBeLessThanOrEqual(s.perSlotQuote + 1e-9);
      total += notional;
    }
    // Total deployable stays within the tradable budget (250 * 0.9).
    expect(total).toBeLessThanOrEqual(250 * 0.9 + 1e-9);
  });

  it("buy fill turns the slot into a sell one level higher; sell fill realizes profit", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const buy = s.desiredOrders(slots, 65_000).find((o) => o.clientId === "grid-buy-4")!;
    s.onPlaced(slots, { ...filled(buy), status: "NEW" });
    expect(slots[4].state).toBe("PENDING_BUY");

    s.onFill(slots, filled(buy));
    expect(slots[4].state).toBe("HOLDING");
    expect(slots[4].qty).toBe(buy.qty);

    const sells = s.desiredOrders(slots, 65_000).filter((o) => o.side === "SELL");
    expect(sells).toHaveLength(1);
    const sell = sells[0];
    expect(sell.clientId).toBe("grid-sell-4");
    expect(sell.price).toBeGreaterThan(buy.price);

    const { realizedQuote } = s.onFill(slots, filled(sell));
    expect(slots[4].state).toBe("EMPTY");
    // one grid step (~1.55%) minus two 0.1% fees, on ~22.5 USDT -> positive
    expect(realizedQuote).toBeGreaterThan(0);
    expect(realizedQuote).toBeLessThan(1);
  });

  it("sells only what was received when the buy fee is charged in base", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const buy = s.desiredOrders(slots, 65_000).find((o) => o.clientId === "grid-buy-4")!;
    const feeBase = buy.qty * 0.001;
    s.onFill(slots, { ...filled(buy), feeQuote: 0, feeBase });
    expect(slots[4].qty).toBeCloseTo(buy.qty - feeBase, 12);
    const sell = s.desiredOrders(slots, 65_000).find((o) => o.side === "SELL")!;
    // never tries to sell more than the slot actually holds
    expect(sell.qty).toBeLessThanOrEqual(slots[4].qty);
  });

  it("absorbs a partially-filled-then-canceled buy instead of losing the coins", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const buy = s.desiredOrders(slots, 65_000).find((o) => o.clientId === "grid-buy-3")!;
    const half = buy.qty / 2;
    s.onFill(slots, {
      ...filled(buy),
      status: "CANCELED",
      executedQty: half,
      executedQuote: buy.price * half,
      feeQuote: 0,
      feeBase: half * 0.001,
    });
    expect(slots[3].state).toBe("HOLDING");
    expect(slots[3].qty).toBeCloseTo(half * 0.999, 12);
    expect(slots[3].costQuote).toBeCloseTo(buy.price * half, 9);
  });

  it("realizes a partial sell pro-rata and keeps holding the rest", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const buy = s.desiredOrders(slots, 65_000).find((o) => o.clientId === "grid-buy-4")!;
    s.onFill(slots, filled(buy));
    const sell = s.desiredOrders(slots, 65_000).find((o) => o.side === "SELL")!;
    const half = sell.qty / 2;
    const { realizedQuote } = s.onFill(slots, {
      ...filled(sell),
      status: "CANCELED",
      executedQty: half,
      executedQuote: sell.price * half,
      feeQuote: sell.price * half * 0.001,
    });
    expect(slots[4].state).toBe("HOLDING");
    expect(slots[4].qty).toBeCloseTo(sell.qty - half, 12);
    // half the step profit, minus fees, on half the lot
    expect(realizedQuote).toBeGreaterThan(0);
    expect(realizedQuote).toBeLessThan(0.5);
  });

  it("cancel returns the slot to a re-placeable state", () => {
    const s = mkStrategy();
    const slots = s.newSlots();
    const buy = s.desiredOrders(slots, 65_000)[0];
    s.onPlaced(slots, { ...filled(buy), status: "NEW" });
    s.onFill(slots, { ...filled(buy), status: "CANCELED", executedQty: 0, executedQuote: 0, feeQuote: 0 });
    const slot = slots[Number(buy.clientId.split("-")[2])];
    expect(slot.state).toBe("EMPTY");
  });
});
