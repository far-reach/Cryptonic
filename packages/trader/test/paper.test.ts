import { describe, expect, it } from "vitest";
import { PaperExchange } from "../src/paper.js";
import { DEFAULT_RULES } from "../src/backtest.js";

const mk = () => new PaperExchange(DEFAULT_RULES, 0.001, 250);

describe("PaperExchange", () => {
  it("escrows quote on buy and fills when price crosses", async () => {
    const ex = mk();
    ex.setPrice(65_000, 1);
    await ex.placeLimit({ symbol: "T", side: "BUY", price: 64_000, qty: 0.0003, clientId: "b" });
    expect((await ex.balances()).quote).toBeCloseTo(250 - 64_000 * 0.0003, 6);

    ex.setPrice(63_990, 2);
    const fills = await ex.drainFills();
    expect(fills).toHaveLength(1);
    expect(fills[0].status).toBe("FILLED");
    const bal = await ex.balances();
    expect(bal.base).toBeCloseTo(0.0003, 9);
    // fee deducted from quote
    expect(bal.quote).toBeCloseTo(250 - 64_000 * 0.0003 - 64_000 * 0.0003 * 0.001, 6);
  });

  it("rejects orders it cannot fund", async () => {
    const ex = mk();
    ex.setPrice(65_000, 1);
    await expect(
      ex.placeLimit({ symbol: "T", side: "BUY", price: 64_000, qty: 1, clientId: "big" }),
    ).rejects.toThrow(/insufficient quote/);
    await expect(
      ex.placeLimit({ symbol: "T", side: "SELL", price: 66_000, qty: 0.1, clientId: "s" }),
    ).rejects.toThrow(/insufficient base/);
  });

  it("cancel refunds escrow", async () => {
    const ex = mk();
    ex.setPrice(65_000, 1);
    const o = await ex.placeLimit({ symbol: "T", side: "BUY", price: 60_000, qty: 0.001, clientId: "b" });
    await ex.cancel(o.orderId);
    expect((await ex.balances()).quote).toBeCloseTo(250, 9);
    const drained = await ex.drainFills();
    expect(drained[0].status).toBe("CANCELED");
  });

  it("candle sweep fills both sides at their limit prices", async () => {
    const ex = mk();
    ex.setPrice(65_000, 1);
    await ex.placeLimit({ symbol: "T", side: "BUY", price: 64_000, qty: 0.001, clientId: "b" });
    ex.setPrice(63_000, 2); // buy fills -> we hold base
    await ex.drainFills();
    await ex.placeLimit({ symbol: "T", side: "SELL", price: 66_000, qty: 0.001, clientId: "s" });
    ex.applyCandle({
      openTime: 3,
      open: 63_000,
      high: 66_500,
      low: 62_900,
      close: 65_500,
      volume: 1,
      closeTime: 4,
    });
    const fills = await ex.drainFills();
    expect(fills).toHaveLength(1);
    expect(fills[0].side).toBe("SELL");
    expect(fills[0].executedQuote).toBeCloseTo(66_000 * 0.001, 9);
  });

  it("marketSell liquidates held base at the current price", async () => {
    const ex = mk();
    ex.setPrice(65_000, 1);
    await ex.placeLimit({ symbol: "T", side: "BUY", price: 64_000, qty: 0.002, clientId: "b" });
    ex.setPrice(64_000, 2);
    await ex.drainFills();
    const sale = await ex.marketSell(0.002);
    expect(sale.executedQty).toBeCloseTo(0.002, 9);
    expect((await ex.balances()).base).toBeCloseTo(0, 12);
  });
});
