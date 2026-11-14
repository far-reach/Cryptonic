#!/usr/bin/env node
/**
 * arb-scan — arbitrage scanner, paper trader and (gated) executor for
 * Bitget, Binance, Bybit and OKX.
 *
 *   arb-scan [scan] [flags]     one snapshot report (default command)
 *   arb-scan paper  [flags]     scan, re-verify after a delay, append to the ledger, update the gate
 *   arb-scan trade  [flags]     execute the best cross-exchange row; dry-run unless --live and the gate passes
 *
 * Common flags:
 *   --demo                 bundled synthetic snapshot (no network)
 *   --json | --text        output format (default markdown)
 *   --venues a,b           subset of bitget,binance,bybit,okx
 *   --quotes USDT,USDC     quote currencies / triangular start currencies
 *   --notional 1000        quote-currency size per leg
 *   --min-net-bps 0        hide cross-exchange / triangular rows below this net edge
 *   --min-apr 5            hide carry rows below this net APR (%)
 *   --hold-days 30         horizon used to amortise carry fees
 *   --depth 5              re-price the top N cross-exchange rows with full order books
 *   --quiet                exit 0 silently when nothing clears the thresholds (scan only)
 *
 * paper flags:
 *   --state-dir DIR        ledger/state/summary location (default ./arbitrage-paper)
 *   --verify-after 5       seconds between detection and re-pricing
 *   --carry-min-apr 15     net APR (%) needed to open a paper carry position
 *
 * trade flags:
 *   --state-dir DIR        same directory as paper (the gate reads its ledger); trades.jsonl + HALT live here
 *   --live                 actually send orders (also needs ARB_LIVE=I_ACCEPT_THE_RISK and a passed gate)
 *   --max-notional 200     hard cap per leg (quote units)
 *   --slippage-bps 3       IOC limit tolerance beyond the quoted price
 *
 * Env: ARB_OUTPUT, ARB_FEES_JSON, GITHUB_STEP_SUMMARY, <VENUE>_API_KEY/_API_SECRET/_API_PASSPHRASE,
 *      ARB_LIVE, ARB_OVERRIDE_GATE.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { credentialsFromEnv, CLIENT_FACTORIES, checkLive, executeCrossExchange, DEFAULT_RISK } from "./execution/index.js";
import { mergeFees } from "./fees.js";
import { runPaper } from "./paper/run.js";
import { renderMarkdown, renderText } from "./report.js";
import { sampleQuotes } from "./sample-data.js";
import { scan, type ScanOptions } from "./scanner.js";
import { VENUES, type Venue } from "./types.js";
import type { ExchangeClient } from "./execution/types.js";

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function emit(markdown: string): void {
  if (process.env.ARB_OUTPUT) writeFileSync(process.env.ARB_OUTPUT, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = ["scan", "paper", "trade"].includes(argv[0] ?? "") ? (argv.shift() as "scan" | "paper" | "trade") : "scan";
  const args = argv;
  const flag = (n: string) => args.includes(n);
  const numArg = (n: string, d: number) => {
    const v = Number(arg(args, n));
    return Number.isFinite(v) ? v : d;
  };
  const venues = (arg(args, "--venues")?.split(",").map((s) => s.trim().toLowerCase()) ?? [...VENUES]).filter((v): v is Venue =>
    (VENUES as readonly string[]).includes(v),
  );
  const quotes = arg(args, "--quotes")?.split(",").map((s) => s.trim().toUpperCase()) ?? ["USDT", "USDC"];

  let fees;
  if (process.env.ARB_FEES_JSON) {
    try {
      fees = mergeFees(JSON.parse(process.env.ARB_FEES_JSON));
    } catch (err) {
      console.error(`Ignoring ARB_FEES_JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const demo = flag("--demo");
  const stateDir = arg(args, "--state-dir") ?? "arbitrage-paper";
  const common: ScanOptions = {
    venues,
    quotes,
    notionalQuote: numArg("--notional", 1_000),
    minNetBps: numArg("--min-net-bps", 0),
    minNetAprPct: numArg("--min-apr", 5),
    holdDays: numArg("--hold-days", 30),
    depthTop: numArg("--depth", 0),
    fees,
    preloaded: demo ? sampleQuotes(Date.now()) : undefined,
  };

  if (command === "paper") {
    const res = await runPaper({
      ...common,
      stateDir,
      verifyAfterSec: numArg("--verify-after", 5),
      carryMinNetAprPct: numArg("--carry-min-apr", 15),
      // In demo mode the "later" snapshot is the same data with the SOL gap half closed.
      laterSnapshot: demo
        ? async () => {
            const d = sampleQuotes(Date.now() + 5_000);
            for (const q of d.spot) if (q.base === "SOL" && q.venue === "okx") q.bid -= 0.2;
            return { t: Date.now() + 5_000, spot: d.spot };
          }
        : undefined,
    });
    const md = `${renderMarkdown(res.scan)}\n\n${res.markdown}`;
    if (flag("--json")) console.log(JSON.stringify({ summary: res.summary, gates: res.gates, records: res.records }, null, 2));
    else console.log(md);
    emit(md);
    const allFailed = !demo && Object.values(res.scan.quoteCounts).every((n) => n === 0);
    if (allFailed) {
      console.error("No venue returned quotes:\n  " + res.scan.errors.join("\n  "));
      return 1;
    }
    return 0;
  }

  if (command === "trade") {
    const live = flag("--live");
    const result = await scan({ ...common, depthTop: Math.max(common.depthTop ?? 0, 3) });
    const best = result.crossExchange[0];
    if (!best) {
      console.log("No cross-exchange opportunity to trade.");
      return 0;
    }
    const check = checkLive({ stateDir, venues: [best.buyVenue, best.sellVenue] });
    if (live && !check.allowed) {
      console.error("Refusing to trade live:\n  " + check.reasons.join("\n  "));
      return 2;
    }
    const creds = credentialsFromEnv();
    const clients: Partial<Record<Venue, ExchangeClient>> = {};
    for (const v of [best.buyVenue, best.sellVenue]) {
      const c = creds[v] ?? (live ? undefined : { apiKey: "dry-run", apiSecret: "dry-run", passphrase: "dry-run" });
      if (c) clients[v] = CLIENT_FACTORIES[v](c);
    }
    const report = await executeCrossExchange(best, {
      clients,
      stateDir,
      live: live && check.allowed,
      fees,
      risk: { ...DEFAULT_RISK, maxNotionalQuote: numArg("--max-notional", DEFAULT_RISK.maxNotionalQuote), slippageToleranceBps: numArg("--slippage-bps", DEFAULT_RISK.slippageToleranceBps), minNetBps: Math.max(DEFAULT_RISK.minNetBps, common.minNetBps ?? 0) },
    });
    console.log(JSON.stringify({ ...report, plan: { ...report.plan, signed: undefined }, gate: check.gate, gateOverridden: check.gateOverridden }, null, 2));
    return report.halted ? 3 : 0;
  }

  const result = await scan(common);
  const nothing = !result.crossExchange.length && !result.triangular.length && !result.basis.length && !result.fundingSpread.length;
  if (flag("--quiet") && nothing) return 0;
  const markdown = renderMarkdown(result);
  if (flag("--json")) console.log(JSON.stringify(result, null, 2));
  else if (flag("--text")) console.log(renderText(result));
  else console.log(markdown);
  emit(markdown);
  if (!demo && Object.values(result.quoteCounts).every((n) => n === 0)) {
    console.error("No venue returned quotes:\n  " + result.errors.join("\n  "));
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
