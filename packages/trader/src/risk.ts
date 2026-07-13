import type { RiskConfig } from "./config.js";
import { utcDay } from "./util.js";

export type RiskVerdict =
  | { action: "TRADE" }
  | { action: "PAUSE_BUYS"; reason: string }
  | { action: "EMERGENCY_STOP"; reason: string };

/**
 * Guard rails evaluated every tick, independent of the strategy:
 *  - emergency stop when price breaks well below the grid floor
 *    (liquidate inventory, halt permanently until a human restarts);
 *  - pause new buys for the rest of the UTC day after the daily
 *    realized-loss limit is hit (sells stay active — they only de-risk).
 */
export class RiskManager {
  private day = "";
  private realizedToday = 0;
  stopped = false;

  constructor(private readonly cfg: RiskConfig, private readonly gridLower: number) {}

  recordRealized(pnlQuote: number, ts: number): void {
    const d = utcDay(ts);
    if (d !== this.day) {
      this.day = d;
      this.realizedToday = 0;
    }
    this.realizedToday += pnlQuote;
  }

  check(price: number, ts: number): RiskVerdict {
    if (this.stopped) return { action: "EMERGENCY_STOP", reason: "already stopped" };

    const floor = this.gridLower * (1 - this.cfg.stopBelowFloor);
    if (price <= floor) {
      this.stopped = true;
      return {
        action: "EMERGENCY_STOP",
        reason: `price ${price.toFixed(2)} broke ${(this.cfg.stopBelowFloor * 100).toFixed(0)}% below grid floor ${this.gridLower.toFixed(2)}`,
      };
    }

    const d = utcDay(ts);
    const lossLimit = this.cfg.budgetQuote * this.cfg.maxDailyLossFraction;
    if (d === this.day && this.realizedToday <= -lossLimit) {
      return {
        action: "PAUSE_BUYS",
        reason: `daily realized loss ${this.realizedToday.toFixed(2)} exceeds -${lossLimit.toFixed(2)}`,
      };
    }

    return { action: "TRADE" };
  }

  /** Restore persisted daily-loss counters (state file round-trip). */
  restore(day: string, realizedToday: number, stopped: boolean): void {
    this.day = day;
    this.realizedToday = realizedToday;
    this.stopped = stopped;
  }

  snapshot(): { day: string; realizedToday: number; stopped: boolean } {
    return { day: this.day, realizedToday: this.realizedToday, stopped: this.stopped };
  }
}
