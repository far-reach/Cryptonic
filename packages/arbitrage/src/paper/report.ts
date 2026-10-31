import type { GateVerdict } from "./gate.js";
import type { PaperSummary, SampleStats } from "./summary.js";

const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const bpsFmt = (n: number) => (Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(1)}` : "n/a");

function sampleRow(label: string, s: SampleStats): string {
  return `| ${label} | ${s.n} | ${pct(s.winRate)} | ${bpsFmt(s.meanExpectedBps)} | ${bpsFmt(s.meanRealisedBps)} | ${bpsFmt(s.ci95LowerBps)} | ${money(s.totalPnlQuote)} |`;
}

export function renderPaperSummary(s: PaperSummary, gates: readonly GateVerdict[]): string {
  const lines: string[] = [];
  lines.push(`# Paper-trading ledger — ${new Date(s.generatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC\n`);
  lines.push(
    `${s.runs} runs over ${s.spanDays} days` +
      (s.firstRunAt ? ` (since ${new Date(s.firstRunAt).toISOString().slice(0, 10)})` : "") +
      `. Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.\n`,
  );

  lines.push(`## Verified opportunities\n`);
  lines.push(`| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  lines.push(sampleRow("Cross-exchange (all)", s.crossExchange));
  lines.push(sampleRow("Cross-exchange (24 h)", s.windows.last24h));
  lines.push(sampleRow("Cross-exchange (7 d)", s.windows.last7d));
  lines.push(sampleRow("Triangular (all)", s.triangular));
  lines.push("");

  const pairs = Object.entries(s.byVenuePair).sort((a, b) => b[1].n - a[1].n);
  if (pairs.length) {
    lines.push(`### By venue pair\n`);
    lines.push(`| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
    for (const [k, v] of pairs.slice(0, 12)) lines.push(sampleRow(k, v));
    lines.push("");
  }

  const c = s.carry;
  lines.push(`## Carry positions (long spot / short perp, paper)\n`);
  lines.push(`| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  lines.push(
    `| ${c.open} | ${c.closed} | ${c.closed ? pct(c.winRate) : "–"} | ${money(c.fundingQuote)} | ${money(c.legPnlQuote)} | −$${c.feesQuote.toFixed(2)} | **${money(c.totalPnlQuote)}** | ${money(c.openPnlQuote)} | ${c.meanHeldHours.toFixed(0)} h |`,
  );
  lines.push("");

  lines.push(`## Go-live gate\n`);
  for (const g of gates) {
    lines.push(`- **${g.strategy}**: ${g.passed ? "✅ passed" : "⛔ not yet"}${g.reasons.length ? " — " + g.reasons.join("; ") : ""}`);
  }
  lines.push("");
  lines.push(
    "> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.",
  );
  return lines.join("\n");
}
