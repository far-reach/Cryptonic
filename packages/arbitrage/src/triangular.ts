import { DEFAULT_FEES, feesFor } from "./fees.js";
import { pairKey } from "./symbols.js";
import { bps, round2 } from "./types.js";
import type { FeeTable, Quote, TriangularLeg, TriangularOpportunity, Venue } from "./types.js";

export interface TriangularOptions {
  /** Currencies a cycle may start from (default USDT, USDC). */
  startCurrencies?: readonly string[];
  minNetBps?: number;
  fees?: FeeTable;
  /** Cap on cycles returned per venue (default 20). */
  limit?: number;
}

/**
 * One directed conversion: holding `from`, trade on `pair` to end up with `to`.
 * `rate` is units of `to` per unit of `from` after the taker fee.
 */
export interface Edge {
  from: string;
  to: string;
  pair: string;
  side: "buy" | "sell";
  price: number;
  rate: number;
  /** Max `from` amount fillable at top of book. */
  maxFrom: number;
}

/** Build the fee-adjusted conversion graph for one venue. */
export function buildEdges(quotes: readonly Quote[], venue: Venue, fees: FeeTable = DEFAULT_FEES): Edge[] {
  const fee = feesFor(fees, venue).spotTakerBps / 10_000;
  const edges: Edge[] = [];
  for (const q of quotes) {
    if (q.venue !== venue || !(q.bid > 0) || !(q.ask > 0)) continue;
    const pair = pairKey(q.base, q.quote);
    // quote -> base: buy base at the ask. Receive (1/ask) base per quote, less fee.
    edges.push({
      from: q.quote,
      to: q.base,
      pair,
      side: "buy",
      price: q.ask,
      rate: (1 / q.ask) * (1 - fee),
      maxFrom: q.askSize * q.ask,
    });
    // base -> quote: sell base at the bid. Receive bid quote per base, less fee.
    edges.push({ from: q.base, to: q.quote, pair, side: "sell", price: q.bid, rate: q.bid * (1 - fee), maxFrom: q.bidSize });
  }
  return edges;
}

function cycleToOpportunity(venue: Venue, legs: Edge[], fees: FeeTable): TriangularOpportunity {
  const fee = feesFor(fees, venue).spotTakerBps;
  let product = 1;
  let amount = Infinity; // start-currency notional that survives every leg's top-of-book size
  let running = 1; // how many units of the current currency one start unit has become (gross of fees)
  for (const e of legs) {
    product *= e.rate;
    // cap start notional by this leg's capacity, translated back into start units
    if (Number.isFinite(e.maxFrom) && e.maxFrom > 0) amount = Math.min(amount, e.maxFrom / running);
    running *= e.side === "buy" ? 1 / e.price : e.price;
  }
  const grossProduct = legs.reduce((p, e) => p * (e.side === "buy" ? 1 / e.price : e.price), 1);
  const feesBps = fee * legs.length;
  return {
    kind: "triangular",
    venue,
    path: [legs[0].from, ...legs.map((e) => e.to)],
    legs: legs.map<TriangularLeg>((e) => ({ pair: e.pair, side: e.side, price: e.price })),
    grossBps: round2(bps(grossProduct - 1)),
    feesBps: round2(feesBps),
    netBps: round2(bps(product - 1)),
    maxNotionalStart: Number.isFinite(amount) ? round2(amount) : 0,
  };
}

/**
 * Exhaustive 3-cycle search from each start currency: start → B → C → start.
 * Deterministic and complete for triangles, which is where almost all real
 * single-venue edge lives (every extra leg adds another taker fee).
 */
export function findTriangles(quotes: readonly Quote[], venue: Venue, opts: TriangularOptions = {}): TriangularOpportunity[] {
  const starts = opts.startCurrencies ?? ["USDT", "USDC"];
  const fees = opts.fees ?? DEFAULT_FEES;
  const minNet = opts.minNetBps ?? 0;
  const edges = buildEdges(quotes, venue, fees);
  const out = new Map<string, Edge[]>(); // adjacency by `from`
  for (const e of edges) {
    const arr = out.get(e.from);
    if (arr) arr.push(e);
    else out.set(e.from, [e]);
  }

  const found: TriangularOpportunity[] = [];
  for (const start of starts) {
    for (const e1 of out.get(start) ?? []) {
      for (const e2 of out.get(e1.to) ?? []) {
        if (e2.to === start || e2.to === e1.to) continue;
        for (const e3 of out.get(e2.to) ?? []) {
          if (e3.to !== start) continue;
          if (e1.rate * e2.rate * e3.rate <= 1) continue;
          const opp = cycleToOpportunity(venue, [e1, e2, e3], fees);
          if (opp.netBps >= minNet) found.push(opp);
        }
      }
    }
  }
  found.sort((a, b) => b.netBps - a.netBps);
  return found.slice(0, opts.limit ?? 20);
}

/**
 * Bellman-Ford negative-cycle detection on weights w = −ln(rate). A negative
 * cycle is a sequence of conversions whose product of rates exceeds 1, i.e. an
 * arbitrage of any length. Returns one cycle (or null). Use this to catch
 * 4+-leg loops that `findTriangles` ignores; the triangle search is preferred
 * for ranking because it enumerates every candidate instead of returning one.
 */
export function bellmanFordCycle(quotes: readonly Quote[], venue: Venue, opts: TriangularOptions = {}): TriangularOpportunity | null {
  const fees = opts.fees ?? DEFAULT_FEES;
  const edges = buildEdges(quotes, venue, fees);
  if (edges.length === 0) return null;
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  const dist = new Map<string, number>(nodes.map((n) => [n, 0])); // virtual source connected to all nodes at 0
  const pred = new Map<string, Edge>();
  let lastRelaxed: string | null = null;

  for (let i = 0; i < nodes.length; i++) {
    lastRelaxed = null;
    for (const e of edges) {
      const w = -Math.log(e.rate);
      const nd = dist.get(e.from)! + w;
      if (nd < dist.get(e.to)! - 1e-12) {
        dist.set(e.to, nd);
        pred.set(e.to, e);
        lastRelaxed = e.to;
      }
    }
    if (!lastRelaxed) return null;
  }

  // A relaxation on the |V|-th pass means a negative cycle is reachable from
  // `lastRelaxed`; walk predecessors |V| times to land inside it, then extract.
  let v = lastRelaxed!;
  for (let i = 0; i < nodes.length; i++) v = pred.get(v)!.from;
  const cycle: Edge[] = [];
  let cur = v;
  do {
    const e = pred.get(cur)!;
    cycle.unshift(e);
    cur = e.from;
  } while (cur !== v && cycle.length <= nodes.length);
  if (cur !== v) return null;
  const opp = cycleToOpportunity(venue, cycle, fees);
  return opp.netBps >= (opts.minNetBps ?? 0) ? opp : null;
}
