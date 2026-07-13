import { describe, expect, it } from "vitest";
import { RiskManager } from "../src/risk.js";
import { DEFAULT_CONFIG, loadConfig, validateConfig } from "../src/config.js";

const DAY = 24 * 3_600_000;
const T0 = Date.UTC(2026, 6, 13); // 2026-07-13

describe("RiskManager", () => {
  it("trades normally inside the range", () => {
    const rm = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    expect(rm.check(61_000, T0).action).toBe("TRADE");
  });

  it("emergency-stops when price breaks below floor - stopBelowFloor", () => {
    const rm = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    // floor = 60000 * (1 - 0.10) = 54000
    expect(rm.check(54_500, T0).action).toBe("TRADE");
    const v = rm.check(53_999, T0);
    expect(v.action).toBe("EMERGENCY_STOP");
    expect(rm.stopped).toBe(true);
    // and stays stopped
    expect(rm.check(65_000, T0 + 1).action).toBe("EMERGENCY_STOP");
  });

  it("hard-stops when total PnL (realized + marked inventory) hits -maxTotalLossQuote", () => {
    const rm = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    // default maxTotalLossQuote = 50
    expect(rm.check(61_000, T0, -49.99).action).toBe("TRADE");
    const v = rm.check(61_000, T0, -50);
    expect(v.action).toBe("EMERGENCY_STOP");
    expect(v.action === "EMERGENCY_STOP" && rm.stopped).toBe(true);
    // permanent: stays stopped even if PnL recovers
    expect(rm.check(61_000, T0 + 1, 0).action).toBe("EMERGENCY_STOP");
  });

  it("pauses buys after the daily loss limit, resumes next UTC day", () => {
    const rm = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    // limit = 250 * 0.05 = 12.5
    rm.recordRealized(-13, T0 + 1000);
    expect(rm.check(61_000, T0 + 2000).action).toBe("PAUSE_BUYS");
    expect(rm.check(61_000, T0 + DAY).action).toBe("TRADE");
  });

  it("round-trips its snapshot", () => {
    const rm = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    rm.recordRealized(-13, T0);
    const snap = rm.snapshot();
    const rm2 = new RiskManager(DEFAULT_CONFIG.risk, 60_000);
    rm2.restore(snap.day, snap.realizedToday, snap.stopped);
    expect(rm2.check(61_000, T0).action).toBe("PAUSE_BUYS");
  });
});

describe("config validation", () => {
  it("accepts the 250 USDT defaults", () => {
    expect(() => validateConfig(loadConfig())).not.toThrow();
  });

  it("rejects budgets spread too thin for Binance minNotional", () => {
    const cfg = loadConfig();
    cfg.risk.budgetQuote = 30;
    cfg.risk.maxTotalLossQuote = 20; // keep the hard-stop cap <= budget
    cfg.grid.levels = 11; // 27/10 = 2.7 USDT per slot < 6
    expect(() => validateConfig(cfg)).toThrow(/budget too thin/);
  });

  it("rejects inverted grid ranges", () => {
    const cfg = loadConfig();
    cfg.grid.lower = 70_000;
    cfg.grid.upper = 60_000;
    expect(() => validateConfig(cfg)).toThrow(/upper/);
  });
});
