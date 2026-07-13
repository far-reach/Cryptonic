import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/backtest.js";
import { syntheticKlines } from "../src/data.js";
import { loadConfig } from "../src/config.js";

describe("backtest (end-to-end through GridBot + PaperExchange)", () => {
  it("earns from round-trips in a sideways market and respects the budget", async () => {
    const cfg = loadConfig();
    const klines = syntheticKlines({ seed: 7, candles: 2_000, anchor: 64_000, vol: 0.005 });
    const r = await runBacktest(cfg, klines);

    expect(r.emergencyStopped).toBe(false);
    expect(r.roundTrips).toBeGreaterThan(5);
    // Grid round-trips are constructed to be profitable after fees.
    expect(r.realizedQuote).toBeGreaterThan(0);
    // Equity never exceeds what the 250 budget could produce grid-trading
    // a bounded range; sanity band rather than an exact value.
    expect(r.finalEquity).toBeGreaterThan(200);
    expect(r.finalEquity).toBeLessThan(400);
    expect(r.feesQuote).toBeGreaterThan(0);
  });

  it("triggers the emergency stop in a crash and preserves most of the budget", async () => {
    const cfg = loadConfig();
    // Strong persistent downtrend: -0.3% per hourly candle ≈ -45% over the run.
    const klines = syntheticKlines({
      seed: 3,
      candles: 400,
      anchor: 64_000,
      vol: 0.004,
      meanReversion: 0,
      drift: -0.003,
    });
    const r = await runBacktest(cfg, klines);

    expect(r.emergencyStopped).toBe(true);
    // The stop liquidates ~10% under the grid floor: losses are bounded far
    // above what buy-and-hold loses in the same crash.
    expect(r.finalEquity).toBeGreaterThan(180);
    expect(r.finalEquity).toBeGreaterThan(r.buyAndHoldEquity);
  });

  it("is deterministic for a fixed seed", async () => {
    const cfg = loadConfig();
    const klines = () => syntheticKlines({ seed: 11, candles: 500, anchor: 64_000, vol: 0.004 });
    const a = await runBacktest(cfg, klines());
    const b = await runBacktest(cfg, klines());
    expect(a.finalEquity).toBe(b.finalEquity);
    expect(a.trades).toBe(b.trades);
  });
});
