import type { Kline, SymbolRules } from "./types.js";
import type { TraderConfig } from "./config.js";
import { PaperExchange } from "./paper.js";
import { GridBot, type Logger } from "./bot.js";
import { autoRange } from "./data.js";

export interface BacktestResult {
  candles: number;
  gridLower: number;
  gridUpper: number;
  startEquity: number;
  finalEquity: number;
  /** Profit locked in by completed round-trips (fees already deducted). */
  realizedQuote: number;
  feesQuote: number;
  trades: number;
  roundTrips: number;
  maxDrawdownPct: number;
  /** Equity of just holding the same budget in the base asset. */
  buyAndHoldEquity: number;
  emergencyStopped: boolean;
}

/** Rules used when we can't reach the exchange (BTCUSDT-shaped defaults). */
export const DEFAULT_RULES: SymbolRules = {
  tickSize: 0.01,
  stepSize: 0.00001,
  minNotional: 5,
};

/**
 * Replay the grid bot over historical/synthetic candles. Uses the exact
 * same GridBot + PaperExchange as live paper mode, so backtest behavior is
 * the behavior you deploy.
 */
export async function runBacktest(
  cfg: TraderConfig,
  klines: Kline[],
  rules: SymbolRules = DEFAULT_RULES,
  log: Logger = () => {},
): Promise<BacktestResult> {
  if (klines.length < 10) throw new Error("need at least 10 candles");

  // Resolve auto-range from the first 20% of the data (no lookahead bias),
  // then trade the remaining 80%.
  const warmup = Math.max(5, Math.floor(klines.length * 0.2));
  const resolved: TraderConfig = { ...cfg, grid: { ...cfg.grid } };
  if (resolved.grid.lower <= 0 || resolved.grid.upper <= 0) {
    const { lower, upper } = autoRange(klines.slice(0, warmup));
    resolved.grid.lower = lower;
    resolved.grid.upper = upper;
  }
  const trading = klines.slice(warmup);

  const start = resolved.risk.budgetQuote;
  const exchange = new PaperExchange(rules, resolved.risk.feeRate, start);
  exchange.setPrice(trading[0].open, trading[0].openTime);
  const bot = new GridBot(resolved, exchange, log);

  let peak = start;
  let maxDrawdownPct = 0;
  let roundTrips = 0;
  let lastRealized = 0;

  for (const candle of trading) {
    exchange.applyCandle(candle);
    const report = await bot.tick(candle.closeTime);
    if (bot.realizedQuote !== lastRealized) {
      roundTrips++;
      lastRealized = bot.realizedQuote;
    }
    peak = Math.max(peak, report.equityQuote);
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - report.equityQuote) / peak) * 100);
    if (bot.risk.stopped) break;
  }

  const finalPrice = trading[trading.length - 1].close;
  const bal = await exchange.balances();
  const finalEquity = bal.quote + bal.lockedQuote + (bal.base + bal.lockedBase) * finalPrice;
  const buyHoldQty = (start * (1 - resolved.risk.feeRate)) / trading[0].open;

  return {
    candles: trading.length,
    gridLower: resolved.grid.lower,
    gridUpper: resolved.grid.upper,
    startEquity: start,
    finalEquity,
    realizedQuote: bot.realizedQuote,
    feesQuote: bot.feesQuote,
    trades: bot.trades,
    roundTrips,
    maxDrawdownPct,
    buyAndHoldEquity: buyHoldQty * finalPrice,
    emergencyStopped: bot.risk.stopped,
  };
}

export function formatBacktest(r: BacktestResult, quote = "USDT"): string {
  const pct = (x: number) => `${(((x - r.startEquity) / r.startEquity) * 100).toFixed(2)}%`;
  return [
    `candles traded     ${r.candles}`,
    `grid range         ${r.gridLower.toFixed(2)} – ${r.gridUpper.toFixed(2)}`,
    `start equity       ${r.startEquity.toFixed(2)} ${quote}`,
    `final equity       ${r.finalEquity.toFixed(2)} ${quote} (${pct(r.finalEquity)})`,
    `realized profit    ${r.realizedQuote.toFixed(2)} ${quote} over ${r.roundTrips} round-trips`,
    `fees paid          ${r.feesQuote.toFixed(2)} ${quote} across ${r.trades} fills`,
    `max drawdown       ${r.maxDrawdownPct.toFixed(2)}%`,
    `buy & hold equity  ${r.buyAndHoldEquity.toFixed(2)} ${quote} (${pct(r.buyAndHoldEquity)})`,
    `emergency stop     ${r.emergencyStopped ? "YES — price broke below grid floor" : "no"}`,
  ].join("\n");
}
