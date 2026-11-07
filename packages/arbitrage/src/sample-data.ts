import type { OrderBook, PerpQuote, Quote } from "./types.js";

/**
 * Synthetic snapshot used by `--demo` and the tests. Planted:
 *  - SOL/USDT: bitget ask 150.00 vs okx bid 150.40 → 26.7 bps gross, 6.7 net after 2×10 bps.
 *  - bitget triangle USDT → ETH → BTC → USDT with ~45 bps gross (15 net).
 *  - SOL perp funding 0.05%/8h on bybit (≈55% APR) vs 0.01% on binance → funding spread.
 *  - XYZ/USDT: a 9% gap that is a symbol collision, not an edge (flagged suspicious).
 * Everything else is tight and should produce nothing after fees.
 */
export function sampleQuotes(now = 1_800_000_000_000): { spot: Quote[]; perps: PerpQuote[]; books: OrderBook[] } {
  const q = (venue: Quote["venue"], base: string, quote: string, bid: number, ask: number, size = 10): Quote => ({
    venue,
    base,
    quote,
    bid,
    ask,
    bidSize: size,
    askSize: size,
    ts: now,
  });
  const spot: Quote[] = [
    // BTC — tight everywhere
    q("bitget", "BTC", "USDT", 64_000.1, 64_000.9, 2),
    q("binance", "BTC", "USDT", 64_000.5, 64_000.6, 5),
    q("bybit", "BTC", "USDT", 64_000.3, 64_001.0, 3),
    q("okx", "BTC", "USDT", 64_000.2, 64_000.8, 3),
    // ETH — tight
    q("bitget", "ETH", "USDT", 3_200.1, 3_200.3, 20),
    q("binance", "ETH", "USDT", 3_200.0, 3_200.2, 50),
    q("bybit", "ETH", "USDT", 3_200.0, 3_200.4, 20),
    q("okx", "ETH", "USDT", 3_200.1, 3_200.3, 20),
    // SOL — planted cross-exchange gap
    q("bitget", "SOL", "USDT", 149.9, 150.0, 400),
    q("binance", "SOL", "USDT", 150.15, 150.2, 1000),
    q("bybit", "SOL", "USDT", 150.1, 150.25, 300),
    q("okx", "SOL", "USDT", 150.4, 150.5, 200),
    // ETH/BTC — bitget priced so the USDT→ETH→BTC→USDT loop pays
    q("bitget", "ETH", "BTC", 0.05023, 0.05024, 15),
    q("binance", "ETH", "BTC", 0.04999, 0.05001, 40),
    q("okx", "ETH", "BTC", 0.04999, 0.05002, 30),
    // stable pair
    q("binance", "USDC", "USDT", 0.9999, 1.0001, 500_000),
    q("okx", "USDC", "USDT", 0.9998, 1.0002, 200_000),
    // ticker collision: two different "XYZ" tokens
    q("bybit", "XYZ", "USDT", 1.0, 1.01, 10_000),
    q("okx", "XYZ", "USDT", 1.1, 1.11, 10_000),
  ];

  const p = (venue: PerpQuote["venue"], base: string, bid: number, ask: number, fundingRate: number, hours = 8): PerpQuote => ({
    venue,
    base,
    quote: "USDT",
    bid,
    ask,
    markPrice: (bid + ask) / 2,
    indexPrice: (bid + ask) / 2,
    fundingRate,
    fundingIntervalHours: hours,
    nextFundingTime: now + 3_600_000,
    ts: now,
  });
  const perps: PerpQuote[] = [
    p("bitget", "BTC", 64_010, 64_011, 0.0001),
    p("binance", "BTC", 64_012, 64_013, 0.0001),
    p("bybit", "BTC", 64_011, 64_012, 0.00012),
    p("okx", "BTC", 64_009, 64_010, 0.00009),
    p("binance", "ETH", 3_201.0, 3_201.2, -0.0002), // negative funding → mirror trade
    p("bybit", "SOL", 150.6, 150.7, 0.0005), // 0.05% / 8h ≈ 55% APR
    p("binance", "SOL", 150.3, 150.4, 0.0001),
    p("okx", "SOL", 150.45, 150.55, 0.0003, 4), // different interval → not comparable for spread
  ];

  // Books for the planted SOL gap: depth thins out, so a $1 000 fill is a bit worse than top-of-book.
  const books: OrderBook[] = [
    {
      venue: "bitget",
      base: "SOL",
      quote: "USDT",
      asks: [
        { price: 150.0, size: 3 },
        { price: 150.05, size: 5 },
        { price: 150.1, size: 20 },
      ],
      bids: [{ price: 149.9, size: 10 }],
      ts: now,
    },
    {
      venue: "okx",
      base: "SOL",
      quote: "USDT",
      bids: [
        { price: 150.4, size: 2 },
        { price: 150.35, size: 4 },
        { price: 150.3, size: 20 },
      ],
      asks: [{ price: 150.5, size: 10 }],
      ts: now,
    },
  ];
  return { spot, perps, books };
}
