#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig, type TraderConfig } from "./config.js";
import { runBacktest, formatBacktest, DEFAULT_RULES } from "./backtest.js";
import { autoRange, fetchKlines, loadKlinesCsv, saveKlinesCsv, syntheticKlines } from "./data.js";
import { PaperExchange } from "./paper.js";
import { BinanceExchange, fetchSymbolRules } from "./binance.js";
import { GridBot } from "./bot.js";
import { loadState, saveState } from "./state.js";

const HELP = `cryptonic-trader — conservative Binance spot grid bot (250 USDT class)

USAGE
  cryptonic-trader <command> [options]

COMMANDS
  backtest     Replay the strategy over historical or synthetic candles
  fetch-data   Download klines from Binance to a CSV (public endpoint)
  paper        Trade live prices with SIMULATED orders (no keys needed)
  live         Trade with REAL orders (testnet by default; guarded for mainnet)
  status       Print the persisted bot state

OPTIONS
  --config <file>     JSON config (see config.example.json); defaults are
                      sized for a 250 USDT budget on BTCUSDT
  --csv <file>        backtest: candles CSV (from fetch-data)
  --synthetic <seed>  backtest: generate deterministic synthetic candles
  --candles <n>       backtest/fetch-data: number of candles (default 720)
  --drift <x>         backtest --synthetic: per-candle drift (e.g. -0.0005)
  --interval <i>      fetch-data: kline interval (default 1h)
  --out <file>        fetch-data: output CSV path

SAFETY
  live mode refuses to start against mainnet unless BOTH
    TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS   is set, and
    the config explicitly sets binance.baseUrl to the mainnet URL.
  Never give the API key withdrawal permission.

OPERATIONS (env vars, all optional)
  AUTOTRADER_ENABLED=false   kill switch: loop exits at the next tick
  (or create a file named "trader.kill" next to the state file)
  TRADER_HEARTBEAT_URL       GET-pinged after every healthy tick
                             (e.g. a healthchecks.io check URL)
  TRADER_ALERT_URL           POSTed a plain-text body on halts and on
                             balance-reconciliation mismatches (works with
                             healthchecks.io /fail, Discord/Slack webhooks)`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      csv: { type: "string" },
      synthetic: { type: "string" },
      candles: { type: "string", default: "720" },
      drift: { type: "string", default: "0" },
      interval: { type: "string", default: "1h" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const cmd = positionals[0];
  if (!cmd || values.help) {
    console.log(HELP);
    return;
  }
  const cfg = loadConfig(values.config);

  switch (cmd) {
    case "backtest":
      return backtest(cfg, values);
    case "fetch-data":
      return fetchData(cfg, values);
    case "paper":
      return run(cfg, "paper");
    case "live":
      return run(cfg, "live");
    case "status":
      return status(cfg);
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`);
  }
}

type Values = { [k: string]: string | boolean | undefined };

async function backtest(cfg: TraderConfig, v: Values): Promise<void> {
  const candles = Number(v.candles);
  let klines;
  if (v.csv) {
    klines = loadKlinesCsv(String(v.csv));
    console.log(`loaded ${klines.length} candles from ${v.csv}`);
  } else {
    const seed = Number(v.synthetic ?? 42);
    klines = syntheticKlines({
      seed,
      candles,
      anchor: 64_000,
      vol: 0.004,
      drift: Number(v.drift),
    });
    console.log(`generated ${klines.length} synthetic hourly candles (seed ${seed}, drift ${v.drift})`);
  }
  const result = await runBacktest(cfg, klines, DEFAULT_RULES, (m) => console.log(`  ${m}`));
  console.log("\n" + formatBacktest(result, cfg.quoteAsset));
}

async function fetchData(cfg: TraderConfig, v: Values): Promise<void> {
  const out = String(v.out ?? `${cfg.symbol}-${v.interval}.csv`);
  const klines = await fetchKlines(cfg.binance.baseUrl, cfg.symbol, String(v.interval), Number(v.candles));
  saveKlinesCsv(out, klines);
  console.log(`saved ${klines.length} ${v.interval} candles for ${cfg.symbol} -> ${out}`);
}

async function status(cfg: TraderConfig): Promise<void> {
  const state = loadState(cfg.stateFile);
  if (!state) {
    console.log(`no state at ${cfg.stateFile}`);
    return;
  }
  const holding = state.slots.filter((s) => s.state === "HOLDING" || s.state === "PENDING_SELL");
  console.log(
    [
      `symbol            ${state.symbol}`,
      `grid              ${state.gridLower.toFixed(2)} – ${state.gridUpper.toFixed(2)} (${state.slots.length} slots)`,
      `realized profit   ${state.realizedQuote.toFixed(4)} (fees ${state.feesQuote.toFixed(4)}, ${state.trades} fills)`,
      `holding slots     ${holding.length} (${holding.reduce((a, s) => a + s.qty, 0)} base)`,
      `risk              day=${state.risk.day} dayPnL=${state.risk.realizedToday.toFixed(4)} stopped=${state.risk.stopped}`,
      `updated           ${new Date(state.updatedAt).toISOString()}`,
    ].join("\n"),
  );
}

const MAINNET = "https://api.binance.com";

async function run(cfg: TraderConfig, mode: "paper" | "live"): Promise<void> {
  if (mode === "live" && cfg.binance.baseUrl === MAINNET) {
    if (process.env.TRADER_LIVE_ACK !== "I_ACCEPT_FULL_RISK_OF_LOSS") {
      throw new Error(
        "refusing mainnet live trading: set TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS " +
          "after reading the README risk section",
      );
    }
  }

  // Resolve auto-range from the last 30 days of daily candles.
  if (cfg.grid.lower <= 0 || cfg.grid.upper <= 0) {
    const daily = await fetchKlines(cfg.binance.baseUrl, cfg.symbol, "1d", 30);
    const { lower, upper } = autoRange(daily);
    cfg.grid.lower = lower;
    cfg.grid.upper = upper;
    console.log(`auto-range from 30d klines: ${lower.toFixed(2)} – ${upper.toFixed(2)}`);
  }

  const resume = loadState(cfg.stateFile);
  if (resume && resume.symbol !== cfg.symbol)
    throw new Error(`state file is for ${resume.symbol}, config says ${cfg.symbol} — move or delete ${cfg.stateFile}`);
  if (resume) {
    // A resumed grid must keep its original levels or slot indexes lie.
    cfg.grid.lower = resume.gridLower;
    cfg.grid.upper = resume.gridUpper;
    console.log(`resuming from ${cfg.stateFile} (realized ${resume.realizedQuote.toFixed(4)} ${cfg.quoteAsset})`);
  }

  let exchange;
  let paper: PaperExchange | undefined;
  if (mode === "live") {
    const live = await BinanceExchange.connect(cfg);
    // Re-arm fill tracking for orders that were open before the restart.
    for (const slot of resume?.slots ?? []) {
      if (slot.orderId && (slot.state === "PENDING_BUY" || slot.state === "PENDING_SELL")) {
        await live.trackByClientId(`grid-${slot.state === "PENDING_BUY" ? "buy" : "sell"}-${slot.index}`);
      }
    }
    exchange = live;
  } else {
    const rules = await fetchSymbolRules(cfg.binance.baseUrl, cfg.symbol).catch(() => DEFAULT_RULES);
    paper = new PaperExchange(rules, cfg.risk.feeRate, cfg.risk.budgetQuote);
    exchange = paper;
  }

  const bot = new GridBot(cfg, exchange, (m) => console.log(`[bot] ${m}`), resume);
  console.log(
    `${mode.toUpperCase()} mode on ${cfg.symbol} @ ${cfg.binance.baseUrl} — budget ${cfg.risk.budgetQuote} ${cfg.quoteAsset}, ` +
      `${cfg.grid.levels} levels, ~${bot.strategy.perSlotQuote.toFixed(2)} ${cfg.quoteAsset}/slot. Ctrl-C to stop (orders persist).`,
  );

  let running = true;
  process.on("SIGINT", () => {
    running = false;
    console.log("\nshutting down (state saved; open orders left in place)...");
  });

  let lastAction = "TRADE";
  let ticks = 0;
  while (running) {
    if (killSwitchActive()) {
      console.log("kill switch active (AUTOTRADER_ENABLED=false or trader.kill file) — exiting; open orders left in place");
      break;
    }
    try {
      const ts = Date.now();
      if (paper) {
        const price = await publicPrice(cfg);
        paper.setPrice(price, ts);
      }
      const r = await bot.tick(ts);
      saveState(cfg.stateFile, bot.snapshot());
      console.log(
        `${new Date(ts).toISOString()} px=${r.price.toFixed(2)} ${r.action}` +
          ` placed=${r.placed} fills=${r.fills} realized=${r.realizedQuote.toFixed(4)} equity=${r.equityQuote.toFixed(2)}`,
      );
      if (r.action !== lastAction) {
        // Loud on state transitions only, so a persistent pause doesn't spam.
        await alert(`[trader ${cfg.symbol}] ${lastAction} -> ${r.action} @ ${r.price.toFixed(2)}, equity ${r.equityQuote.toFixed(2)} ${cfg.quoteAsset}`);
        lastAction = r.action;
      }
      // Independent balance-truth check: the bot's book vs the exchange.
      // Catches silent-failure bug classes that per-order accounting misses.
      if (mode === "live" && ++ticks % 20 === 0) await reconcile(bot, cfg);
      await heartbeat();
      if (r.action === "EMERGENCY_STOP") {
        console.log("bot halted by emergency stop — inspect state, then delete the state file to restart");
        break;
      }
    } catch (err) {
      console.error(`tick error: ${(err as Error).message}`);
    }
    await sleep(cfg.pollSeconds * 1000);
  }
  saveState(cfg.stateFile, bot.snapshot());
}

function killSwitchActive(): boolean {
  return process.env.AUTOTRADER_ENABLED === "false" || existsSync("trader.kill");
}

/** Dead-man's-switch ping (healthchecks.io-style). Fail-silent by design. */
async function heartbeat(): Promise<void> {
  const url = process.env.TRADER_HEARTBEAT_URL;
  if (!url) return;
  await fetch(url).catch(() => {});
}

/** Loud out-of-band alert (webhook). Fail-silent: alerting must never break trading. */
async function alert(message: string): Promise<void> {
  console.log(`[alert] ${message}`);
  const url = process.env.TRADER_ALERT_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: message,
  }).catch(() => {});
}

/**
 * Compare the bot's recorded inventory against what the exchange actually
 * holds. The account may legitimately hold MORE base than the bot bought
 * (user's own funds); holding LESS means the books are wrong — halt-worthy.
 */
async function reconcile(bot: GridBot, cfg: TraderConfig): Promise<void> {
  const bal = await bot.exchange.balances();
  const inv = bot.strategy.inventory(bot.slots).qty;
  const accountBase = bal.base + bal.lockedBase;
  const tolerance = bot.exchange.rules.stepSize * 3;
  if (accountBase < inv - tolerance) {
    await alert(
      `[trader ${cfg.symbol}] RECONCILE MISMATCH: bot books ${inv} ${cfg.baseAsset} ` +
        `but account holds ${accountBase} — investigate before trusting PnL`,
    );
  }
}

async function publicPrice(cfg: TraderConfig): Promise<number> {
  const res = await fetch(
    `${cfg.binance.baseUrl.replace(/\/$/, "")}/api/v3/ticker/price?symbol=${cfg.symbol}`,
  );
  if (!res.ok) throw new Error(`ticker failed: ${res.status}`);
  return Number(((await res.json()) as { price: string }).price);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
