import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bookKey } from "../crossExchange.js";
import { DEFAULT_FEES } from "../fees.js";
import { scan, type ScanOptions } from "../scanner.js";
import type { FetchLike, OrderBook, Quote, ScanResult, Venue } from "../types.js";
import { ADAPTERS } from "../venues/index.js";
import { evaluateAllGates, type GateVerdict } from "./gate.js";
import { appendLedger, readLedger, readState, writeState } from "./ledger.js";
import { stepCarry, verifyOpportunities, type Snapshot } from "./paper.js";
import { renderPaperSummary } from "./report.js";
import { summarise, type PaperSummary } from "./summary.js";
import type { LedgerRecord, RunRecord } from "./types.js";

export interface PaperRunOptions extends ScanOptions {
  /** Directory holding ledger.jsonl / state.json / summary.md. */
  stateDir: string;
  /** Seconds to wait before re-pricing detected opportunities (default 5). */
  verifyAfterSec?: number;
  /** Verify at most this many cross-exchange + triangular rows per run (default 10 each). */
  maxVerify?: number;
  /** Minimum net APR (%) to open a paper carry position (default 15). */
  carryMinNetAprPct?: number;
  carryMaxPositions?: number;
  /** Injected for tests: produce the later snapshot instead of sleeping and refetching. */
  laterSnapshot?: (first: ScanResult) => Promise<Snapshot>;
  sleep?: (ms: number) => Promise<void>;
}

export interface PaperRunResult {
  scan: ScanResult;
  records: LedgerRecord[];
  summary: PaperSummary;
  gates: GateVerdict[];
  markdown: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch a later snapshot: fresh tickers from every venue plus books for the markets we need. */
async function refetchSnapshot(first: ScanResult, opts: PaperRunOptions, fetchFn: FetchLike): Promise<Snapshot> {
  const venues = opts.venues ?? (Object.keys(first.quoteCounts) as Venue[]);
  const spot = (await Promise.all(venues.map((v) => ADAPTERS[v].spot(fetchFn).catch(() => [] as Quote[])))).flat();
  const books = new Map<string, OrderBook>();
  const wanted = new Set<string>();
  for (const o of first.crossExchange.slice(0, opts.maxVerify ?? 10)) {
    wanted.add(bookKey(o.buyVenue, o.base, o.quote));
    wanted.add(bookKey(o.sellVenue, o.base, o.quote));
  }
  await Promise.all(
    [...wanted].map(async (key) => {
      const [venue, pair] = key.split(":") as [Venue, string];
      const [base, quote] = pair.split("/");
      try {
        books.set(key, await ADAPTERS[venue].orderBook(base, quote, fetchFn, 50));
      } catch {
        // fall back to top-of-book for this market
      }
    }),
  );
  return { t: Date.now(), spot, books };
}

/**
 * One paper-trading step: scan → wait → re-price → append to the ledger →
 * advance carry positions → rewrite the summary. Designed to be run by a
 * scheduler (GitHub Actions cron, systemd timer) every few minutes.
 */
export async function runPaper(opts: PaperRunOptions): Promise<PaperRunResult> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  const fees = opts.fees ?? DEFAULT_FEES;
  const maxVerify = opts.maxVerify ?? 10;
  const first = await scan({ ...opts, depthTop: opts.depthTop ?? maxVerify, includeRaw: true });
  const detectedAt = first.generatedAt;

  const candidates = [...first.crossExchange.slice(0, maxVerify), ...first.triangular.slice(0, maxVerify)];
  let later: Snapshot;
  if (opts.laterSnapshot) later = await opts.laterSnapshot(first);
  else {
    await (opts.sleep ?? defaultSleep)((opts.verifyAfterSec ?? 5) * 1000);
    later = candidates.length ? await refetchSnapshot(first, opts, fetchFn) : { t: Date.now(), spot: [] };
  }
  const { detects, verifies } = verifyOpportunities({ detectedAt, opportunities: candidates, later, fees, notionalQuote: opts.notionalQuote ?? 1_000 });

  const state = readState(opts.stateDir);
  // Carry marks use the first scan's quotes (perps are not part of the later snapshot).
  const carry = stepCarry(state, first.basis, first.raw?.spot ?? [], first.raw?.perps ?? [], {
    notionalQuote: opts.notionalQuote ?? 1_000,
    holdDays: opts.holdDays ?? 30,
    minNetAprPct: opts.carryMinNetAprPct ?? 15,
    maxPositions: opts.carryMaxPositions,
    now: opts.now ?? detectedAt,
  });

  const run: RunRecord = { type: "run", t: detectedAt, quoteCounts: first.quoteCounts, errors: first.errors };
  const records: LedgerRecord[] = [run, ...detects, ...verifies, ...carry.records];
  appendLedger(opts.stateDir, records);
  writeState(opts.stateDir, carry.state);

  const ledger = readLedger(opts.stateDir);
  const summary = summarise(ledger, carry.state, opts.now ?? Date.now());
  const gates = evaluateAllGates(summary);
  const markdown = renderPaperSummary(summary, gates);
  writeFileSync(join(opts.stateDir, "summary.md"), markdown + "\n");
  writeFileSync(join(opts.stateDir, "summary.json"), JSON.stringify({ summary, gates }, null, 2) + "\n");
  return { scan: first, records, summary, gates, markdown };
}
