import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendLedger,
  bookKey,
  DEFAULT_GATE,
  emptyState,
  evaluateAllGates,
  evaluateGate,
  findBasis,
  findCrossExchange,
  findTriangles,
  readLedger,
  renderPaperSummary,
  runPaper,
  sampleQuotes,
  sampleStats,
  stepCarry,
  summarise,
  verifyCrossExchange,
  verifyOpportunities,
  verifyTriangular,
  type LedgerRecord,
  type OrderBook,
  type VerifyRecord,
} from "../src/index.js";

const NOW = 1_800_000_000_000;
const tmp = () => mkdtempSync(join(tmpdir(), "arb-paper-"));

describe("verify", () => {
  const { spot, books } = sampleQuotes(NOW);
  const sol = findCrossExchange(spot, { notionalQuote: 1_000 }).opportunities.find((o) => o.base === "SOL" && o.sellVenue === "okx")!;

  it("realises the top-of-book edge when nothing moved", () => {
    const r = verifyCrossExchange(sol, { t: NOW + 5_000, spot });
    expect(r.netBps).toBeCloseTo(sol.netBps, 0);
    expect(r.pnl).toBeCloseTo((sol.netBps / 1e4) * 1_000, 1);
  });

  it("realises less when the gap closed and marks the market gone when a quote vanished", () => {
    const moved = spot.map((q) => (q.venue === "okx" && q.base === "SOL" ? { ...q, bid: 150.0 } : q));
    expect(verifyCrossExchange(sol, { t: NOW + 5_000, spot: moved }).netBps!).toBeLessThan(0);
    const gone = spot.filter((q) => !(q.venue === "okx" && q.base === "SOL"));
    expect(verifyCrossExchange(sol, { t: NOW + 5_000, spot: gone }).netBps).toBeNull();
  });

  it("walks later order books when they are given", () => {
    const map = new Map<string, OrderBook>(books.map((b) => [bookKey(b.venue, b.base, b.quote), b]));
    const r = verifyCrossExchange(sol, { t: NOW + 5_000, spot, books: map });
    expect(r.netBps).toBeCloseTo(2.2, 0); // same as the depth-checked scan
  });

  it("re-prices a triangle leg by leg", () => {
    const tri = findTriangles(spot, "bitget")[0];
    expect(verifyTriangular(tri, { t: NOW + 5_000, spot }).netBps).toBeCloseTo(tri.netBps, 1);
    const flat = spot.map((q) => (q.venue === "bitget" && q.base === "ETH" && q.quote === "BTC" ? { ...q, bid: 0.05 } : q));
    expect(verifyTriangular(tri, { t: NOW + 5_000, spot: flat }).netBps!).toBeLessThan(0);
  });

  it("produces paired detect/verify records with stable ids", () => {
    const { detects, verifies } = verifyOpportunities({ detectedAt: NOW, opportunities: [sol], later: { t: NOW + 4_000, spot } });
    expect(detects[0].id).toBe(verifies[0].id);
    expect(verifies[0]).toMatchObject({ kind: "cross-exchange", delayMs: 4_000, survived: true, venues: ["bitget", "okx"] });
  });
});

describe("carry paper positions", () => {
  const { spot, perps } = sampleQuotes(NOW);
  const basis = findBasis(spot, perps, { minNetAprPct: 0 });
  const opts = { notionalQuote: 1_000, holdDays: 30, minNetAprPct: 15, now: NOW };

  it("opens long-only positions above the APR threshold, one per perp", () => {
    const { state, records } = stepCarry(emptyState(), basis, spot, perps, opts);
    expect(state.positions.every((p) => p.direction === "long-spot-short-perp")).toBe(true);
    expect(state.positions.map((p) => `${p.base}@${p.perpVenue}`)).toEqual(["SOL@okx", "SOL@bybit"]);
    expect(records.filter((r) => r.type === "carry-open")).toHaveLength(2);
    expect(state.runs).toBe(1);
  });

  it("accrues funding pro rata and closes at the hold horizon with fees charged", () => {
    const opened = stepCarry(emptyState(), basis, spot, perps, opts).state;
    const eightHoursLater = stepCarry(opened, [], spot, perps, { ...opts, now: NOW + 8 * 3_600_000 });
    const bybit = eightHoursLater.state.positions.find((p) => p.perpVenue === "bybit")!;
    expect(bybit.accruedFunding).toBeCloseTo(0.0005 * 1_000, 2); // one full 8 h interval at 0.05%
    const expired = stepCarry(eightHoursLater.state, [], spot, perps, { ...opts, now: NOW + 31 * 86_400_000 });
    const closes = expired.records.filter((r) => r.type === "carry-close");
    expect(closes).toHaveLength(2);
    expect(closes.every((c) => c.type === "carry-close" && c.reason === "hold-expired")).toBe(true);
    const c = closes.find((r) => r.type === "carry-close" && r.perpVenue === "bybit")!;
    if (c.type !== "carry-close") throw new Error();
    expect(c.feesQuote).toBeCloseTo(3.1, 2);
    expect(c.fundingQuote).toBeGreaterThan(c.feesQuote);
    expect(c.pnlQuote).toBeCloseTo(c.fundingQuote + c.legPnl - c.feesQuote, 2);
  });

  it("closes when funding flips against the position for three marks, and when the market disappears", () => {
    let st = stepCarry(emptyState(), basis, spot, perps, opts).state;
    const flipped = perps.map((p) => (p.base === "SOL" ? { ...p, fundingRate: -0.0002 } : p));
    for (let i = 1; i <= 3; i++) st = stepCarry(st, [], spot, flipped, { ...opts, now: NOW + i * 3_600_000 }).state;
    expect(st.positions).toHaveLength(0);
    const st2 = stepCarry(emptyState(), basis, spot, perps, opts).state;
    const gone = stepCarry(st2, [], spot, perps.filter((p) => p.venue !== "bybit"), { ...opts, now: NOW + 3_600_000 });
    expect(gone.records.some((r) => r.type === "carry-close" && r.reason === "market-gone")).toBe(true);
  });
});

describe("summary + gate", () => {
  const v = (over: Partial<VerifyRecord>): VerifyRecord => ({
    type: "verify",
    t: NOW,
    id: "x",
    kind: "cross-exchange",
    label: "SOL/USDT bitget→okx",
    venues: ["bitget", "okx"],
    delayMs: 5_000,
    notionalQuote: 1_000,
    expectedNetBps: 5,
    realisedNetBps: 3,
    pnlQuote: 0.3,
    survived: true,
    ...over,
  });

  it("computes win rate, means and a CI lower bound; unpriced samples count as fee losses", () => {
    const s = sampleStats([v({}), v({ realisedNetBps: -1, pnlQuote: -0.1, survived: false }), v({ realisedNetBps: null, pnlQuote: 0, survived: false })]);
    expect(s.n).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.unpriced).toBe(1);
    expect(s.meanRealisedBps).toBeCloseTo((3 - 1 - 20) / 3, 2);
    expect(s.ci95LowerBps).toBeLessThan(s.meanRealisedBps);
    expect(sampleStats([]).n).toBe(0);
  });

  it("passes the gate only with enough consistent, positive samples over enough days", () => {
    const good: LedgerRecord[] = [];
    for (let i = 0; i < 40; i++) good.push(v({ t: NOW + i * 6 * 3_600_000, realisedNetBps: 4 + (i % 3), pnlQuote: 0.4 }));
    const state = { ...emptyState(), runs: 40, firstRunAt: NOW, lastRunAt: NOW + 39 * 6 * 3_600_000 };
    const summary = summarise(good, state, NOW + 40 * 6 * 3_600_000);
    expect(summary.spanDays).toBeGreaterThan(7);
    expect(evaluateGate(summary, "cross-exchange").passed).toBe(true);
    expect(evaluateGate(summary, "triangular").passed).toBe(false);
    expect(evaluateGate(summary, "carry").passed).toBe(false);
    // Same samples but half of them losers: the CI bound fails even though cumulative P&L is positive.
    const noisy = good.map((r, i) => (i % 2 ? v({ ...(r as VerifyRecord), realisedNetBps: -3, pnlQuote: -0.3, survived: false }) : r));
    const noisySummary = summarise(noisy, state, NOW + 40 * 6 * 3_600_000);
    expect(noisySummary.crossExchange.totalPnlQuote).toBeGreaterThan(0);
    expect(evaluateGate(noisySummary, "cross-exchange").passed).toBe(false);
    expect(evaluateGate(noisySummary, "cross-exchange", { ...DEFAULT_GATE, minWinRate: 0.5, minCi95LowerBps: -Infinity }).passed).toBe(true);
  });

  it("renders a markdown summary with the gate verdicts", () => {
    const summary = summarise([v({})], emptyState(), NOW);
    const md = renderPaperSummary(summary, evaluateAllGates(summary));
    expect(md).toContain("Cross-exchange (all) | 1");
    expect(md).toContain("⛔ not yet");
  });
});

describe("runPaper end-to-end", () => {
  it("appends a ledger, persists state and writes the summary", async () => {
    const dir = tmp();
    const data = sampleQuotes(NOW);
    const res = await runPaper({
      stateDir: dir,
      preloaded: data,
      now: NOW,
      laterSnapshot: async () => ({ t: NOW + 5_000, spot: data.spot }),
    });
    expect(res.records.some((r) => r.type === "run")).toBe(true);
    expect(res.records.filter((r) => r.type === "verify").length).toBeGreaterThan(0);
    expect(res.summary.runs).toBe(1);
    expect(existsSync(join(dir, "summary.md"))).toBe(true);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    const ledger = readLedger(dir);
    expect(ledger.length).toBe(res.records.length);
    // second run sees the first
    const res2 = await runPaper({ stateDir: dir, preloaded: data, now: NOW + 3_600_000, laterSnapshot: async () => ({ t: NOW + 3_605_000, spot: data.spot }) });
    expect(res2.summary.runs).toBe(2);
    expect(res2.summary.crossExchange.n).toBe(2);
    expect(readFileSync(join(dir, "summary.md"), "utf8")).toContain("2 runs");
  });

  it("skips torn ledger lines", () => {
    const dir = tmp();
    appendLedger(dir, [{ type: "run", t: NOW, quoteCounts: {}, errors: [] }]);
    require("node:fs").appendFileSync(join(dir, "ledger.jsonl"), '{"type":"run","t":');
    expect(readLedger(dir)).toHaveLength(1);
  });
});
