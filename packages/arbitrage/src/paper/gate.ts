import type { PaperSummary, SampleStats } from "./summary.js";

/**
 * Go-live gate. Live execution is refused until the paper ledger shows, for the
 * strategy in question, enough samples over enough time with a positive realised
 * mean whose 95% confidence lower bound is also positive. The thresholds are
 * deliberately conservative; loosen them only with a reason you can write down.
 */
export interface GateCriteria {
  minSamples: number;
  minSpanDays: number;
  minWinRate: number;
  /** Lower bound of the 95% CI of mean realised bps must exceed this. */
  minCi95LowerBps: number;
  /** For carry: minimum closed positions. */
  minClosedPositions: number;
}

export const DEFAULT_GATE: GateCriteria = {
  minSamples: 30,
  minSpanDays: 7,
  minWinRate: 0.55,
  minCi95LowerBps: 0,
  minClosedPositions: 10,
};

export type Strategy = "cross-exchange" | "triangular" | "carry";

export interface GateVerdict {
  strategy: Strategy;
  passed: boolean;
  reasons: string[];
}

function checkSamples(s: SampleStats, spanDays: number, c: GateCriteria): string[] {
  const reasons: string[] = [];
  if (s.n < c.minSamples) reasons.push(`only ${s.n} verified samples (need ${c.minSamples})`);
  if (spanDays < c.minSpanDays) reasons.push(`ledger spans ${spanDays} days (need ${c.minSpanDays})`);
  if (s.totalPnlQuote <= 0) reasons.push(`cumulative paper P&L is ${s.totalPnlQuote} (need > 0)`);
  if (s.winRate < c.minWinRate) reasons.push(`win rate ${(s.winRate * 100).toFixed(0)}% (need ${(c.minWinRate * 100).toFixed(0)}%)`);
  if (!Number.isFinite(s.ci95LowerBps)) reasons.push("95% CI not estimable yet (need ≥ 2 samples)");
  else if (!(s.ci95LowerBps > c.minCi95LowerBps)) reasons.push(`95% CI lower bound ${s.ci95LowerBps} bps (need > ${c.minCi95LowerBps})`);
  return reasons;
}

export function evaluateGate(summary: PaperSummary, strategy: Strategy, criteria: GateCriteria = DEFAULT_GATE): GateVerdict {
  let reasons: string[];
  if (strategy === "cross-exchange") reasons = checkSamples(summary.crossExchange, summary.spanDays, criteria);
  else if (strategy === "triangular") reasons = checkSamples(summary.triangular, summary.spanDays, criteria);
  else {
    const c = summary.carry;
    reasons = [];
    if (c.closed < criteria.minClosedPositions) reasons.push(`only ${c.closed} closed paper positions (need ${criteria.minClosedPositions})`);
    if (summary.spanDays < criteria.minSpanDays) reasons.push(`ledger spans ${summary.spanDays} days (need ${criteria.minSpanDays})`);
    if (c.totalPnlQuote <= 0) reasons.push(`cumulative closed P&L is ${c.totalPnlQuote} (need > 0)`);
    if (c.winRate < criteria.minWinRate) reasons.push(`win rate ${(c.winRate * 100).toFixed(0)}% (need ${(criteria.minWinRate * 100).toFixed(0)}%)`);
  }
  return { strategy, passed: reasons.length === 0, reasons };
}

export const evaluateAllGates = (summary: PaperSummary, criteria: GateCriteria = DEFAULT_GATE): GateVerdict[] =>
  (["cross-exchange", "triangular", "carry"] as Strategy[]).map((s) => evaluateGate(summary, s, criteria));
