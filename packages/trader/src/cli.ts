#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig, type TraderConfig } from "./config.js";
import { runBacktest, formatBacktest, DEFAULT_RULES } from "./backtest.js";
import { autoRange, loadKlinesCsv, saveKlinesCsv, syntheticKlines } from "./data.js";
import { PaperExchange } from "./paper.js";
import { connectLive, isRealMoney, marketKlines, marketPrice, marketRules } from "./venue.js";
import { GridBot } from "./bot.js";
import { loadState, saveState } from "./state.js";

const HELP = `cryptonic-trader — conservative Binance spot grid bot (250 USDT class)

USAGE
  cryptonic-trader <command> [options]

COMMANDS
  backtest     Replay the strategy over historical or synthetic candles
  sweep        Stress-test: backtest matrix across regimes x volatility x seeds
  fetch-data   Download klines from Binance to a CSV (public endpoint)
  paper        Trade live prices with SIMULATED orders (no keys needed)
  live         Trade with REAL orders (testnet by default; guarded for mainnet)
  status       Print the persisted bot state
  gates        Evaluate PREREG promotion-gate progress from the state file

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
    case "sweep":
      return sweep(cfg, values);
    case "fetch-data":
      return fetchData(cfg, values);
    case "paper":
      return run(cfg, "paper");
    case "live":
      return run(cfg, "live");
    case "status":
      return status(cfg);
    case "gates":
      return gates(cfg);
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

/**
 * Regime stress sweep: bounds strategy behavior across market types without
 * real data. NOT a substitute for PREREG gate 1 (real-data backtest) — this
 * answers "how bad can it get / where does it earn", not "does it earn on
 * actual BTCUSDT paths".
 */
async function sweep(cfg: TraderConfig, v: Values): Promise<void> {
  const candles = Number(v.candles ?? 1_440); // ~60 days of hourly
  const regimes = [
    { name: "crash    ", drift: -0.003, mr: 0 },
    { name: "bear     ", drift: -0.001, mr: 0 },
    { name: "soft-bear", drift: -0.0003, mr: 0.01 },
    { name: "sideways ", drift: 0, mr: 0.02 },
    { name: "soft-bull", drift: 0.0003, mr: 0.01 },
    { name: "bull     ", drift: 0.001, mr: 0 },
  ];
  const vols = [0.002, 0.004, 0.008];
  const seeds = [1, 2, 3, 4, 5];
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const pct = (equity: number) => ((equity / cfg.risk.budgetQuote - 1) * 100);

  console.log(`sweep: ${regimes.length} regimes x ${vols.length} vols x ${seeds.length} seeds, ${candles} hourly candles each, anchor 64000\n`);
  console.log(`regime     vol    medianPnL%  worstPnL%  stops  medianRTs  vsHold(med)`);
  let worstEquity = Infinity;
  for (const r of regimes) {
    for (const vol of vols) {
      const runs = [];
      for (const seed of seeds) {
        const klines = syntheticKlines({ seed, candles, anchor: 64_000, vol, meanReversion: r.mr, drift: r.drift });
        runs.push(await runBacktest(cfg, klines));
      }
      const eq = runs.map((x) => x.finalEquity);
      const stops = runs.filter((x) => x.emergencyStopped).length;
      const vsHold = median(runs.map((x) => x.finalEquity - x.buyAndHoldEquity));
      worstEquity = Math.min(worstEquity, ...eq);
      console.log(
        `${r.name}  ${vol.toFixed(3)}  ${pct(median(eq)).toFixed(2).padStart(9)}%  ${pct(Math.min(...eq)).toFixed(2).padStart(8)}%  ${String(stops).padStart(3)}/5  ${String(median(runs.map((x) => x.roundTrips))).padStart(8)}  ${vsHold >= 0 ? "+" : ""}${vsHold.toFixed(2)} USDT`,
      );
    }
  }
  console.log(`\nworst single-run equity across all ${regimes.length * vols.length * seeds.length} runs: ${worstEquity.toFixed(2)} ${cfg.quoteAsset} (${pct(worstEquity).toFixed(2)}%)`);
  console.log(`PREREG kill-criterion floor is ${(cfg.risk.budgetQuote * 0.85).toFixed(2)} — worst case ${worstEquity >= cfg.risk.budgetQuote * 0.85 ? "stays above" : "BREACHES"} it.`);
}

async function fetchData(cfg: TraderConfig, v: Values): Promise<void> {
  const out = String(v.out ?? `${cfg.symbol}-${v.interval}.csv`);
  // Always real market data — never a testnet's thin-book price history.
  const klines = await marketKlines(cfg, String(v.interval), Number(v.candles));
  saveKlinesCsv(out, klines);
  console.log(`saved ${klines.length} ${v.interval} candles for ${cfg.symbol} (${cfg.exchange}) -> ${out}`);
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

/**
 * Mechanical readout of PREREG.md gate progress, so checkpoint reviews are
 * arithmetic. Criteria mirror PREREG and must be changed there first.
 */
async function gates(cfg: TraderConfig): Promise<void> {
  const state = loadState(cfg.stateFile);
  if (!state) {
    console.log(`no state at ${cfg.stateFile} — nothing running here yet`);
    return;
  }
  const days = (Date.now() - (state.startedAt ?? state.updatedAt)) / 86_400_000;
  const perTrip = state.roundTrips > 0 ? state.realizedQuote / state.roundTrips : 0;
  const expectedPerTrip = 0.3; // backtest expectation, PREREG gate 2 allows within 2x
  const mark = (ok: boolean) => (ok ? "PASS" : "not yet");

  console.log(
    [
      `deployment window  ${days.toFixed(1)} days (since ${new Date(state.startedAt ?? state.updatedAt).toISOString()})`,
      `round-trips        ${state.roundTrips}`,
      `realized PnL       ${state.realizedQuote.toFixed(4)} ${cfg.quoteAsset} (${perTrip.toFixed(4)}/round-trip; expectation ~${expectedPerTrip})`,
      `emergency stop     ${state.risk.stopped ? "FIRED — kill criterion 2 applies, see PREREG" : "no"}`,
      ``,
      `PREREG gate 2 (paper, needs ALL):`,
      `  >= 14 days           ${mark(days >= 14)} (${days.toFixed(1)}/14)`,
      `  >= 10 round-trips    ${mark(state.roundTrips >= 10)} (${state.roundTrips}/10)`,
      `  per-trip within 2x   ${mark(state.roundTrips > 0 && perTrip >= expectedPerTrip / 2)}`,
      `PREREG gate 3 (testnet, needs ALL):`,
      `  >= 7 days            ${mark(days >= 7)} (${days.toFixed(1)}/7)`,
      `  restart-resume test  verify manually (restart the process; state + orders must survive)`,
      `  reconciliation       clean unless a RECONCILE MISMATCH alert fired`,
      ``,
      `Verdicts apply to the mode this state file belongs to (paper vs testnet).`,
    ].join("\n"),
  );
}

async function run(cfg: TraderConfig, mode: "paper" | "live"): Promise<void> {
  if (mode === "live" && isRealMoney(cfg)) {
    if (process.env.TRADER_LIVE_ACK !== "I_ACCEPT_FULL_RISK_OF_LOSS") {
      throw new Error(
        `refusing real-money live trading (${cfg.exchange}): set TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS ` +
          "after reading the README risk section",
      );
    }
  }

  // Resolve auto-range from the last 30 days of REAL daily candles (public
  // market data — a testnet's price history would produce absurd ranges).
  if (cfg.grid.lower <= 0 || cfg.grid.upper <= 0) {
    const daily = await marketKlines(cfg, "1d", 30);
    const { lower, upper } = autoRange(daily);
    cfg.grid.lower = lower;
    cfg.grid.upper = upper;
    console.log(`auto-range from 30d real klines (${cfg.exchange}): ${lower.toFixed(2)} – ${upper.toFixed(2)}`);
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
    const live = await connectLive(cfg);
    // Re-arm fill tracking for orders that were open before the restart.
    for (const slot of resume?.slots ?? []) {
      if (slot.orderId && (slot.state === "PENDING_BUY" || slot.state === "PENDING_SELL")) {
        await live.trackByClientId(`grid-${slot.state === "PENDING_BUY" ? "buy" : "sell"}-${slot.index}`);
      }
    }
    exchange = live;
  } else {
    // Paper mode is a pure market-data consumer: real rules, real prices.
    const rules = await marketRules(cfg).catch(() => DEFAULT_RULES);
    paper = new PaperExchange(rules, cfg.risk.feeRate, cfg.risk.budgetQuote);
    exchange = paper;
  }

  const venueUrl = cfg.exchange === "bitget" ? cfg.bitget.baseUrl : cfg.binance.baseUrl;
  const bot = new GridBot(cfg, exchange, (m) => console.log(`[bot] ${m}`), resume);
  console.log(
    `${mode.toUpperCase()} mode on ${cfg.symbol} @ ${venueUrl} (${cfg.exchange}) — budget ${cfg.risk.budgetQuote} ${cfg.quoteAsset}, ` +
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
        const price = await marketPrice(cfg);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
