import { readFileSync } from "node:fs";

export interface GridConfig {
  /** Bottom of the trading range (quote). If 0, derived from recent klines. */
  lower: number;
  /** Top of the trading range (quote). If 0, derived from recent klines. */
  upper: number;
  /** Number of grid lines (>= 2). Levels are geometrically spaced. */
  levels: number;
}

export interface RiskConfig {
  /**
   * Hard cap on total quote the bot may ever deploy. The bot never spends
   * more than this regardless of account balance.
   */
  budgetQuote: number;
  /** Fraction of the budget kept as a fee/slippage buffer (never traded). */
  reserveFraction: number;
  /**
   * Safety stop: if price drops this fraction below the grid floor, cancel
   * everything, market-sell inventory bought by the bot, and halt.
   * e.g. 0.10 = halt 10% under the floor.
   */
  stopBelowFloor: number;
  /** Halt for the rest of the UTC day if realized daily loss exceeds this fraction of budget. */
  maxDailyLossFraction: number;
  /**
   * Absolute hard stop in quote currency: if total PnL (realized + open
   * inventory marked to market) reaches this loss, cancel everything,
   * liquidate, and halt permanently until a human restarts.
   */
  maxTotalLossQuote: number;
  /** Taker/maker fee per fill used by paper/backtest accounting (0.001 = 0.1%). */
  feeRate: number;
}

export interface TraderConfig {
  symbol: string;
  /** Order venue: "binance" (default; has a free testnet) or "bitget" (no spot testnet — canary-size first). */
  exchange: "binance" | "bitget";
  /** e.g. "BTC" — parsed from symbol if omitted. */
  baseAsset: string;
  /** e.g. "USDT" */
  quoteAsset: string;
  grid: GridConfig;
  risk: RiskConfig;
  /** Main-loop poll interval in seconds (live/paper). */
  pollSeconds: number;
  /** Where bot state (inventory, PnL, order map) is persisted. */
  stateFile: string;
  binance: {
    /** Order venue. Live: https://api.binance.com — Testnet: https://testnet.binance.vision */
    baseUrl: string;
    /**
     * Market-data venue for klines/auto-range/paper prices. Always the REAL
     * market mirror (no key needed) — testnet price history is garbage from
     * thin fake books and must never feed backtests or grid ranging.
     */
    dataUrl: string;
    /** Read from env, never from this file: BINANCE_API_KEY / BINANCE_API_SECRET. */
    apiKeyEnv: string;
    apiSecretEnv: string;
    recvWindowMs: number;
  };
  bitget: {
    /** Bitget has one production environment: https://api.bitget.com */
    baseUrl: string;
    apiKeyEnv: string;
    apiSecretEnv: string;
    /** Bitget API keys additionally require a passphrase, set at key creation. */
    passphraseEnv: string;
  };
}

/** Conservative defaults sized for a 250 USDT starting budget. */
export const DEFAULT_CONFIG: TraderConfig = {
  symbol: "BTCUSDT",
  exchange: "binance",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  grid: {
    lower: 0, // 0 = auto-range from the last 30 days of daily klines
    upper: 0,
    levels: 11, // 10 slots -> ~22 USDT per slot from a 250 USDT budget
  },
  risk: {
    budgetQuote: 250,
    reserveFraction: 0.1, // 25 USDT kept back for fees/slippage
    stopBelowFloor: 0.1,
    maxDailyLossFraction: 0.05, // stop for the day after -12.5 USDT realized
    maxTotalLossQuote: 50, // operator hard stop: halt for good at -50 USDT total
    feeRate: 0.001,
  },
  pollSeconds: 30,
  stateFile: "trader-state.json",
  binance: {
    baseUrl: "https://testnet.binance.vision",
    dataUrl: "https://data-api.binance.vision",
    apiKeyEnv: "BINANCE_API_KEY",
    apiSecretEnv: "BINANCE_API_SECRET",
    recvWindowMs: 10_000,
  },
  bitget: {
    baseUrl: "https://api.bitget.com",
    apiKeyEnv: "BITGET_API_KEY",
    apiSecretEnv: "BITGET_API_SECRET",
    passphraseEnv: "BITGET_API_PASSPHRASE",
  },
};

/** Deep-merge a partial user config over the defaults and validate it. */
export function loadConfig(path?: string): TraderConfig {
  let user: Partial<TraderConfig> = {};
  if (path) user = JSON.parse(readFileSync(path, "utf8"));
  const cfg: TraderConfig = {
    ...DEFAULT_CONFIG,
    ...user,
    grid: { ...DEFAULT_CONFIG.grid, ...user.grid },
    risk: { ...DEFAULT_CONFIG.risk, ...user.risk },
    binance: { ...DEFAULT_CONFIG.binance, ...user.binance },
    bitget: { ...DEFAULT_CONFIG.bitget, ...user.bitget },
  };
  validateConfig(cfg);
  return cfg;
}

export function validateConfig(cfg: TraderConfig): void {
  const { grid, risk } = cfg;
  if (!/^[A-Z0-9]{5,}$/.test(cfg.symbol)) throw new Error(`bad symbol: ${cfg.symbol}`);
  if (cfg.exchange !== "binance" && cfg.exchange !== "bitget")
    throw new Error(`exchange must be "binance" or "bitget", got: ${cfg.exchange}`);
  if (grid.levels < 2) throw new Error("grid.levels must be >= 2");
  if (grid.lower < 0 || grid.upper < 0) throw new Error("grid bounds must be >= 0");
  if (grid.lower > 0 && grid.upper > 0 && grid.upper <= grid.lower)
    throw new Error("grid.upper must be > grid.lower");
  if (risk.budgetQuote <= 0) throw new Error("risk.budgetQuote must be > 0");
  if (risk.reserveFraction < 0 || risk.reserveFraction >= 1)
    throw new Error("risk.reserveFraction must be in [0,1)");
  if (risk.stopBelowFloor <= 0 || risk.stopBelowFloor > 0.5)
    throw new Error("risk.stopBelowFloor must be in (0,0.5]");
  if (risk.maxDailyLossFraction <= 0 || risk.maxDailyLossFraction > 1)
    throw new Error("risk.maxDailyLossFraction must be in (0,1]");
  if (risk.maxTotalLossQuote <= 0 || risk.maxTotalLossQuote > risk.budgetQuote)
    throw new Error("risk.maxTotalLossQuote must be in (0, budgetQuote]");
  if (risk.feeRate < 0 || risk.feeRate > 0.01) throw new Error("risk.feeRate must be in [0,0.01]");
  const tradable = risk.budgetQuote * (1 - risk.reserveFraction);
  const perSlot = tradable / (grid.levels - 1);
  // Binance spot NOTIONAL floor is 5 USDT on the major pairs; leave headroom.
  if (perSlot < 6)
    throw new Error(
      `budget too thin: ${perSlot.toFixed(2)} ${cfg.quoteAsset}/slot — ` +
        `lower grid.levels or raise the budget (need >= 6 per slot)`,
    );
}
