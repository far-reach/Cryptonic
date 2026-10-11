#!/usr/bin/env node
/**
 * arb-scan — snapshot scanner for cross-exchange, triangular and funding/basis
 * arbitrage across Bitget, Binance, Bybit and OKX (public endpoints only).
 *
 * Flags:
 *   --demo                 use the bundled synthetic snapshot (no network)
 *   --json                 print the ScanResult as JSON instead of markdown
 *   --text                 print the compact text summary
 *   --venues a,b,c         subset of bitget,binance,bybit,okx (default all)
 *   --quotes USDT,USDC     quote currencies to scan (default USDT,USDC)
 *   --notional 1000        quote-currency size per leg
 *   --min-net-bps 5        hide cross-exchange / triangular rows below this net edge
 *   --min-apr 5            hide carry rows below this net APR (%)
 *   --hold-days 30         horizon used to amortise carry fees
 *   --depth 5              re-price the top N cross-exchange rows with full order books
 *   --quiet                exit 0 with no output when nothing clears the thresholds
 *
 * Env:
 *   ARB_OUTPUT             also write the markdown report to this path
 *   ARB_FEES_JSON          JSON override, e.g. {"bitget":{"spotTakerBps":8}}
 *   GITHUB_STEP_SUMMARY    (set by Actions) report is appended automatically
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { mergeFees } from "./fees.js";
import { renderMarkdown, renderText } from "./report.js";
import { sampleQuotes } from "./sample-data.js";
import { scan } from "./scanner.js";
import { VENUES, type Venue } from "./types.js";

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
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
  const result = await scan({
    venues,
    quotes,
    notionalQuote: numArg("--notional", 1_000),
    minNetBps: numArg("--min-net-bps", 0),
    minNetAprPct: numArg("--min-apr", 5),
    holdDays: numArg("--hold-days", 30),
    depthTop: numArg("--depth", 0),
    fees,
    preloaded: demo ? sampleQuotes(Date.now()) : undefined,
  });

  const nothing = !result.crossExchange.length && !result.triangular.length && !result.basis.length && !result.fundingSpread.length;
  if (flag("--quiet") && nothing) return 0;

  const allFailed = !demo && Object.values(result.quoteCounts).every((n) => n === 0);
  const markdown = renderMarkdown(result);
  if (flag("--json")) console.log(JSON.stringify(result, null, 2));
  else if (flag("--text")) console.log(renderText(result));
  else console.log(markdown);

  if (process.env.ARB_OUTPUT) writeFileSync(process.env.ARB_OUTPUT, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  if (allFailed) {
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
