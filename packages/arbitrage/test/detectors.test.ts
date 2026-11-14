import { describe, expect, it } from "vitest";
import {
  annualisePct,
  bellmanFordCycle,
  bookKey,
  fillBuy,
  fillSell,
  findBasis,
  findCrossExchange,
  findFundingSpreads,
  findTriangles,
  parseLevels,
  renderMarkdown,
  renderText,
  sampleQuotes,
  scan,
  splitDelimited,
  splitSymbol,
  type OrderBook,
  type Quote,
} from "../src/index.js";

const NOW = 1_800_000_000_000;
const q = (venue: Quote["venue"], base: string, quote: string, bid: number, ask: number, size = 100, ts = NOW): Quote => ({
  venue,
  base,
  quote,
  bid,
  ask,
  bidSize: size,
  askSize: size,
  ts,
});

describe("symbols", () => {
  it("splits concatenated and delimited symbols on known quotes, longest first", () => {
    expect(splitSymbol("SOLUSDT")).toEqual({ base: "SOL", quote: "USDT" });
    expect(splitSymbol("BTCFDUSD")).toEqual({ base: "BTC", quote: "FDUSD" });
    expect(splitSymbol("ETHBTC")).toEqual({ base: "ETH", quote: "BTC" });
    expect(splitSymbol("USDT")).toBeNull();
    expect(splitDelimited("BTC-USDT-SWAP")).toEqual({ base: "BTC", quote: "USDT" });
    expect(splitDelimited("garbage")).toBeNull();
  });
});

describe("depth", () => {
  const asks = parseLevels([["100", "1"], ["101", "1"], ["99", "0.5"]], "asks");
  it("sorts levels best-first and drops junk", () => {
    expect(asks.map((l) => l.price)).toEqual([99, 100, 101]);
    expect(parseLevels([["x", "1"], ["1", "0"], 5], "bids")).toEqual([]);
  });
  it("walks the asks for a buy and reports exhaustion", () => {
    const f = fillBuy(asks, 149.5); // 0.5@99 = 49.5, then 1@100 = 100
    expect(f.filledQuote).toBeCloseTo(149.5);
    expect(f.filledBase).toBeCloseTo(1.5);
    expect(f.avgPrice).toBeCloseTo(149.5 / 1.5);
    expect(f.exhausted).toBe(false);
    expect(fillBuy(asks, 1_000).exhausted).toBe(true);
  });
  it("walks the bids for a sell", () => {
    const bids = parseLevels([["100", "1"], ["99", "2"]], "bids");
    const f = fillSell(bids, 2);
    expect(f.avgPrice).toBeCloseTo(99.5);
    expect(fillSell(bids, 10).exhausted).toBe(true);
  });
});

describe("cross-exchange", () => {
  it("finds the planted SOL gap net of both taker fees and sizes it by top-of-book", () => {
    const { opportunities } = findCrossExchange(sampleQuotes(NOW).spot, { notionalQuote: 1_000 });
    const sol = opportunities.find((o) => o.base === "SOL" && o.buyVenue === "bitget" && o.sellVenue === "okx");
    expect(sol).toBeDefined();
    expect(sol!.grossBps).toBeCloseTo(((150.4 - 150) / 150) * 1e4, 0);
    expect(sol!.feesBps).toBe(20);
    expect(sol!.netBps).toBeCloseTo(sol!.grossBps - 20, 1);
    expect(sol!.maxNotionalQuote).toBeCloseTo(200 * 150.4, 0); // okx bid size is the binding side
    expect(sol!.depthChecked).toBe(false);
    // the withdrawal estimate makes a one-off transfer unattractive
    expect(sol!.netAfterTransferBps!).toBeLessThan(sol!.netBps);
    expect(sol!.transferMinutes).toBeGreaterThan(0);
  });

  it("ranks by net edge and respects minNetBps", () => {
    const all = findCrossExchange(sampleQuotes(NOW).spot).opportunities;
    for (let i = 1; i < all.length; i++) expect(all[i - 1].netBps).toBeGreaterThanOrEqual(all[i].netBps);
    expect(findCrossExchange(sampleQuotes(NOW).spot, { minNetBps: 50 }).opportunities).toHaveLength(0);
  });

  it("never reports the tight BTC/USDT and ETH/USDT books as opportunities", () => {
    const { opportunities } = findCrossExchange(sampleQuotes(NOW).spot);
    expect(opportunities.some((o) => o.quote === "USDT" && (o.base === "BTC" || o.base === "ETH"))).toBe(false);
  });

  it("flags a 9% gap as suspicious instead of tradable", () => {
    const { opportunities, suspicious } = findCrossExchange(sampleQuotes(NOW).spot);
    expect(opportunities.some((o) => o.base === "XYZ")).toBe(false);
    expect(suspicious.map((o) => o.base)).toContain("XYZ");
  });

  it("drops stale quotes and crossed/invalid ones", () => {
    const quotes = [q("bitget", "SOL", "USDT", 149, 150), q("okx", "SOL", "USDT", 151, 152, 100, NOW - 60_000), q("bybit", "SOL", "USDT", 152, 151)];
    expect(findCrossExchange(quotes).opportunities).toHaveLength(0);
  });

  it("re-prices with order books when provided", () => {
    const { spot, books } = sampleQuotes(NOW);
    const map = new Map<string, OrderBook>(books.map((b) => [bookKey(b.venue, b.base, b.quote), b]));
    const top = findCrossExchange(spot, { notionalQuote: 1_000 }).opportunities.find((o) => o.base === "SOL" && o.sellVenue === "okx")!;
    const deep = findCrossExchange(spot, { notionalQuote: 1_000, books: map }).opportunities.find((o) => o.base === "SOL" && o.sellVenue === "okx")!;
    expect(deep.depthChecked).toBe(true);
    expect(deep.buyPrice).toBeGreaterThan(top.buyPrice);
    expect(deep.sellPrice).toBeLessThan(top.sellPrice);
    expect(deep.netBps).toBeLessThan(top.netBps);
    expect(deep.maxNotionalQuote).toBeCloseTo(2 * 150.4 + 4 * 150.35 + 20 * 150.3, 0);
  });
});

describe("triangular", () => {
  it("finds the planted bitget USDT→ETH→BTC→USDT loop with per-leg fees", () => {
    const tri = findTriangles(sampleQuotes(NOW).spot, "bitget");
    expect(tri.length).toBeGreaterThan(0);
    const best = tri[0];
    expect(best.path).toEqual(["USDT", "ETH", "BTC", "USDT"]);
    expect(best.legs.map((l) => `${l.side} ${l.pair}`)).toEqual(["buy ETH/USDT", "sell ETH/BTC", "sell BTC/USDT"]);
    const gross = ((1 / 3200.3) * 0.05023 * 64000.1 - 1) * 1e4;
    expect(best.grossBps).toBeCloseTo(gross, 0);
    expect(best.feesBps).toBe(30);
    expect(best.netBps).toBeCloseTo(((1 - 0.001) ** 3 * (1 + gross / 1e4) - 1) * 1e4, 0);
    expect(best.maxNotionalStart).toBeGreaterThan(0);
  });

  it("finds nothing on venues with consistent books", () => {
    expect(findTriangles(sampleQuotes(NOW).spot, "binance")).toHaveLength(0);
    expect(findTriangles(sampleQuotes(NOW).spot, "okx")).toHaveLength(0);
  });

  it("Bellman-Ford agrees with the exhaustive search and catches a 4-leg loop", () => {
    const bf = bellmanFordCycle(sampleQuotes(NOW).spot, "bitget");
    expect(bf).not.toBeNull();
    expect(bf!.netBps).toBeCloseTo(findTriangles(sampleQuotes(NOW).spot, "bitget")[0].netBps, 1);
    // A → B → C → D → A loop that only exists at length 4
    const four = [
      q("okx", "AAA", "USDT", 1.0, 1.0),
      q("okx", "BBB", "AAA", 1.0, 1.0),
      q("okx", "CCC", "BBB", 1.0, 1.0),
      q("okx", "CCC", "USDT", 1.02, 1.03),
    ];
    expect(findTriangles(four, "okx")).toHaveLength(0);
    const cyc = bellmanFordCycle(four, "okx");
    expect(cyc).not.toBeNull();
    expect(cyc!.path).toHaveLength(5);
    expect(cyc!.netBps).toBeGreaterThan(0);
  });
});

describe("basis / funding", () => {
  it("annualises a per-interval rate", () => {
    expect(annualisePct(0.0001, 8)).toBeCloseTo(10.95, 2);
    expect(annualisePct(0.0001, 4)).toBeCloseTo(21.9, 1);
  });

  it("prices long-spot/short-perp carry with fees amortised over the hold", () => {
    const { spot, perps } = sampleQuotes(NOW);
    const rows = findBasis(spot, perps, { holdDays: 30, minNetAprPct: 0 });
    const sol = rows.find((r) => r.base === "SOL" && r.perpVenue === "bybit")!;
    expect(sol.direction).toBe("long-spot-short-perp");
    expect(sol.spotVenue).toBe("bybit"); // same-venue spot preferred
    expect(sol.fundingAprPct).toBeCloseTo(annualisePct(0.0005, 8), 1);
    expect(sol.roundTripFeesBps).toBeCloseTo(2 * (10 + 5.5), 2);
    expect(sol.breakevenHours).toBeCloseTo((31 / 5) * 8, 1);
    expect(sol.netAprPct).toBeCloseTo(sol.fundingAprPct - (31 / 100) * (365 / 30), 1);
    expect(sol.basisBps).toBeCloseTo(((150.6 - 150.25) / 150.25) * 1e4, 0);
  });

  it("marks negative-funding trades as needing borrow and dedupes to one row per perp", () => {
    const { spot, perps } = sampleQuotes(NOW);
    const rows = findBasis(spot, perps, { minNetAprPct: 0 });
    const eth = rows.filter((r) => r.base === "ETH");
    expect(eth).toHaveLength(1);
    expect(eth[0].direction).toBe("short-spot-long-perp");
    expect(findBasis(spot, perps, { minNetAprPct: 0, dedupe: false }).filter((r) => r.base === "ETH").length).toBeGreaterThan(1);
  });

  it("pairs perps across venues by funding differential, same interval only", () => {
    const rows = findFundingSpreads(sampleQuotes(NOW).perps, { minNetAprPct: 0 });
    const sol = rows.filter((r) => r.base === "SOL");
    expect(sol.some((r) => r.longVenue === "binance" && r.shortVenue === "bybit")).toBe(true);
    expect(sol.some((r) => r.longVenue === "okx" || r.shortVenue === "okx")).toBe(false); // 4h contract excluded
    const best = sol[0];
    expect(best.spread).toBeCloseTo(0.0004, 6);
    expect(best.spreadAprPct).toBeCloseTo(annualisePct(0.0004, 8), 1);
  });
});

describe("scanner + report", () => {
  it("runs end-to-end on preloaded data and renders markdown", async () => {
    const data = sampleQuotes(NOW);
    const r = await scan({ preloaded: data, now: NOW, minNetBps: 1 });
    expect(r.crossExchange[0].base).toBe("SOL");
    expect(r.crossExchange[0].depthChecked).toBe(true);
    expect(r.triangular[0].venue).toBe("bitget");
    expect(r.basis.length).toBeGreaterThan(0);
    expect(r.fundingSpread.length).toBe(1);
    expect(r.suspicious.map((s) => s.base)).toEqual(["XYZ"]);
    expect(r.errors).toEqual([]);
    const md = renderMarkdown(r);
    expect(md).toContain("SOL/USDT");
    expect(md).toContain("USDT → ETH → BTC → USDT");
    expect(md).toContain("🚩 Suspicious");
    expect(renderText(r)).toContain("cross-exchange: 1");
  });

  it("filters venues and quote currencies", async () => {
    const r = await scan({ preloaded: sampleQuotes(NOW), venues: ["binance", "okx"], quotes: ["USDT"], now: NOW });
    expect(Object.keys(r.quoteCounts)).toEqual(["binance", "okx"]);
    expect(r.crossExchange.every((o) => ["binance", "okx"].includes(o.buyVenue))).toBe(true);
    expect(r.triangular).toHaveLength(0);
  });
});
