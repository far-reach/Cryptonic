import { round2 } from "../types.js";
import type { LedgerRecord, PaperState, VerifyRecord } from "./types.js";

export interface SampleStats {
  n: number;
  /** Samples whose realised edge was positive. */
  wins: number;
  winRate: number;
  meanExpectedBps: number;
  meanRealisedBps: number;
  /** Lower bound of the 95% confidence interval of the mean realised bps (normal approximation). */
  ci95LowerBps: number;
  totalPnlQuote: number;
  /** Samples that could not be re-priced (market vanished); counted as losses of the full fee. */
  unpriced: number;
}

export interface CarryStats {
  open: number;
  closed: number;
  wins: number;
  winRate: number;
  totalPnlQuote: number;
  fundingQuote: number;
  legPnlQuote: number;
  feesQuote: number;
  meanHeldHours: number;
  /** Unrealised P&L of open positions (accrued funding + last leg mark − fees to close). */
  openPnlQuote: number;
}

export interface PaperSummary {
  generatedAt: number;
  firstRunAt: number | null;
  lastRunAt: number | null;
  runs: number;
  spanDays: number;
  crossExchange: SampleStats;
  triangular: SampleStats;
  carry: CarryStats;
  /** Realised stats per venue pair, cross-exchange only. */
  byVenuePair: Record<string, SampleStats>;
  /** Trailing-window realised stats. */
  windows: { last24h: SampleStats; last7d: SampleStats };
}

export function sampleStats(records: readonly VerifyRecord[]): SampleStats {
  const n = records.length;
  if (n === 0) return { n: 0, wins: 0, winRate: 0, meanExpectedBps: 0, meanRealisedBps: 0, ci95LowerBps: 0, totalPnlQuote: 0, unpriced: 0 };
  // An unpriced sample (market gone) is treated as losing the fees it would have paid.
  const realised = records.map((r) => (r.realisedNetBps === null ? -20 : r.realisedNetBps));
  const mean = realised.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? realised.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(variance / n);
  const wins = records.filter((r) => r.survived).length;
  return {
    n,
    wins,
    winRate: round2(wins / n),
    meanExpectedBps: round2(records.reduce((a, r) => a + r.expectedNetBps, 0) / n),
    meanRealisedBps: round2(mean),
    ci95LowerBps: round2(n > 1 ? mean - 1.96 * se : mean - Infinity),
    totalPnlQuote: round2(records.reduce((a, r) => a + r.pnlQuote, 0)),
    unpriced: records.filter((r) => r.realisedNetBps === null).length,
  };
}

export function summarise(ledger: readonly LedgerRecord[], state: PaperState, now = Date.now()): PaperSummary {
  const verifies = ledger.filter((r): r is VerifyRecord => r.type === "verify");
  const cross = verifies.filter((v) => v.kind === "cross-exchange");
  const tri = verifies.filter((v) => v.kind === "triangular");
  const closes = ledger.filter((r) => r.type === "carry-close");
  const marks = ledger.filter((r) => r.type === "carry-mark");

  const byPair: Record<string, SampleStats> = {};
  const pairs = new Map<string, VerifyRecord[]>();
  for (const v of cross) {
    const k = v.venues.join("→");
    const arr = pairs.get(k);
    if (arr) arr.push(v);
    else pairs.set(k, [v]);
  }
  for (const [k, arr] of pairs) byPair[k] = sampleStats(arr);

  const closedWins = closes.filter((c) => c.pnlQuote > 0).length;
  const openPnl = state.positions.reduce((a, p) => {
    const last = [...marks].reverse().find((m) => m.id === p.id);
    return a + p.accruedFunding + (last?.legPnl ?? 0) - (p.roundTripFeesBps / 10_000) * p.notionalQuote;
  }, 0);

  const runRecords = ledger.filter((r) => r.type === "run");
  const firstRunAt = state.firstRunAt ?? runRecords[0]?.t ?? null;
  const lastRunAt = state.lastRunAt ?? runRecords[runRecords.length - 1]?.t ?? null;
  return {
    generatedAt: now,
    firstRunAt,
    lastRunAt,
    runs: state.runs || runRecords.length,
    spanDays: firstRunAt && lastRunAt ? round2((lastRunAt - firstRunAt) / 86_400_000) : 0,
    crossExchange: sampleStats(cross),
    triangular: sampleStats(tri),
    carry: {
      open: state.positions.length,
      closed: closes.length,
      wins: closedWins,
      winRate: closes.length ? round2(closedWins / closes.length) : 0,
      totalPnlQuote: round2(closes.reduce((a, c) => a + c.pnlQuote, 0)),
      fundingQuote: round2(closes.reduce((a, c) => a + c.fundingQuote, 0)),
      legPnlQuote: round2(closes.reduce((a, c) => a + c.legPnl, 0)),
      feesQuote: round2(closes.reduce((a, c) => a + c.feesQuote, 0)),
      meanHeldHours: closes.length ? round2(closes.reduce((a, c) => a + c.heldHours, 0) / closes.length) : 0,
      openPnlQuote: round2(openPnl),
    },
    byVenuePair: byPair,
    windows: {
      last24h: sampleStats(cross.filter((v) => now - v.t <= 86_400_000)),
      last7d: sampleStats(cross.filter((v) => now - v.t <= 7 * 86_400_000)),
    },
  };
}
