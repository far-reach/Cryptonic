import { describe, expect, it } from "vitest";
import {
  ADAPTERS,
  parseBinanceBookTickers,
  parseBinanceFundingInfo,
  parseBinanceOrderBook,
  parseBinancePerps,
  parseBitgetContracts,
  parseBitgetOrderBook,
  parseBitgetPerpTickers,
  parseBitgetSpotTickers,
  parseBitgetWithdrawals,
  parseBybitInstruments,
  parseBybitOrderBook,
  parseBybitPerpTickers,
  parseBybitSpotTickers,
  parseOkxOrderBook,
  parseOkxPerps,
  parseOkxSpotTickers,
  scan,
  type FetchLike,
} from "../src/index.js";

const NOW = 1_800_000_000_000;

describe("bitget parsers", () => {
  it("spot tickers", () => {
    const body = { code: "00000", data: [{ symbol: "SOLUSDT", bidPr: "150.1", askPr: "150.2", bidSz: "12", askSz: "8", ts: "1800000000001" }, { symbol: "BAD", bidPr: "0" }] };
    const [q] = parseBitgetSpotTickers(body, NOW);
    expect(q).toMatchObject({ venue: "bitget", base: "SOL", quote: "USDT", bid: 150.1, ask: 150.2, bidSize: 12, askSize: 8, ts: 1800000000001 });
    expect(parseBitgetSpotTickers(body, NOW)).toHaveLength(1);
    expect(() => parseBitgetSpotTickers({ code: "40001", msg: "nope" })).toThrow(/40001/);
  });
  it("perp tickers with funding interval from contracts", () => {
    const contracts = parseBitgetContracts({ code: "00000", data: [{ symbol: "SOLUSDT", fundInterval: "4" }] });
    const [p] = parseBitgetPerpTickers(
      { code: "00000", data: [{ symbol: "SOLUSDT", bidPr: "150", askPr: "150.1", fundingRate: "0.0002", markPrice: "150.05", indexPrice: "150.04", ts: "1" }] },
      contracts,
      NOW,
    );
    expect(p).toMatchObject({ venue: "bitget", base: "SOL", fundingRate: 0.0002, fundingIntervalHours: 4, markPrice: 150.05 });
  });
  it("orderbook and withdrawals", () => {
    const ob = parseBitgetOrderBook({ code: "00000", data: { asks: [["150.2", "1"], ["150.1", "2"]], bids: [["150", "3"]], ts: "5" } }, "SOL", "USDT");
    expect(ob.asks[0].price).toBe(150.1);
    expect(ob.bids[0]).toEqual({ price: 150, size: 3 });
    const w = parseBitgetWithdrawals({
      code: "00000",
      data: [{ coin: "SOL", chains: [{ chain: "SOL", withdrawFee: "0.01", withdrawable: "true", withdrawConfirm: "2" }, { chain: "BEP20", withdrawFee: "0.001", withdrawable: "false" }] }],
    });
    expect(w.SOL.fee).toBe(0.01);
  });
});

describe("binance parsers", () => {
  it("bookTicker, premiumIndex join, fundingInfo, depth", () => {
    const [q] = parseBinanceBookTickers([{ symbol: "ETHUSDT", bidPrice: "3200.1", bidQty: "5", askPrice: "3200.2", askQty: "6" }], NOW);
    expect(q).toMatchObject({ venue: "binance", base: "ETH", quote: "USDT", bid: 3200.1, askSize: 6, ts: NOW });
    const intervals = parseBinanceFundingInfo([{ symbol: "ETHUSDT", fundingIntervalHours: 4 }]);
    const perps = parseBinancePerps(
      [{ symbol: "ETHUSDT", markPrice: "3201", indexPrice: "3200.5", lastFundingRate: "-0.0001", nextFundingTime: 1800000000000, time: 1 }, { symbol: "NOBOOKUSDT", lastFundingRate: "0.1" }],
      [{ symbol: "ETHUSDT", bidPrice: "3200.9", askPrice: "3201.1" }],
      intervals,
      NOW,
    );
    expect(perps).toHaveLength(1);
    expect(perps[0]).toMatchObject({ base: "ETH", bid: 3200.9, fundingRate: -0.0001, fundingIntervalHours: 4, nextFundingTime: 1800000000000 });
    const ob = parseBinanceOrderBook({ bids: [["3200", "1"]], asks: [["3201", "2"]] }, "ETH", "USDT", NOW);
    expect(ob.asks).toEqual([{ price: 3201, size: 2 }]);
  });
});

describe("bybit parsers", () => {
  it("spot / linear tickers, instruments, orderbook", () => {
    const spot = parseBybitSpotTickers({ retCode: 0, result: { list: [{ symbol: "BTCUSDT", bid1Price: "64000", bid1Size: "1", ask1Price: "64001", ask1Size: "2" }] }, time: 7 });
    expect(spot[0]).toMatchObject({ venue: "bybit", base: "BTC", bid: 64000, askSize: 2, ts: 7 });
    const intervals = parseBybitInstruments({ retCode: 0, result: { list: [{ symbol: "BTCUSDT", fundingInterval: "240" }] } });
    const perps = parseBybitPerpTickers(
      { retCode: 0, result: { list: [{ symbol: "BTCUSDT", bid1Price: "64010", ask1Price: "64011", fundingRate: "0.0001", nextFundingTime: "1800000000000", markPrice: "64010.5" }] } },
      intervals,
    );
    expect(perps[0]).toMatchObject({ fundingIntervalHours: 4, fundingRate: 0.0001, markPrice: 64010.5 });
    expect(() => parseBybitSpotTickers({ retCode: 10001, retMsg: "bad" })).toThrow(/10001/);
    const ob = parseBybitOrderBook({ retCode: 0, result: { b: [["64000", "1"]], a: [["64001", "1"]], ts: 9 } }, "BTC", "USDT");
    expect(ob.bids[0].price).toBe(64000);
    expect(ob.ts).toBe(9);
  });
});

describe("okx parsers", () => {
  it("spot tickers, swaps joined with funding (interval from timestamps), books", () => {
    const spot = parseOkxSpotTickers({ code: "0", data: [{ instId: "SOL-USDT", bidPx: "150", bidSz: "3", askPx: "150.1", askSz: "4", ts: "11" }] });
    expect(spot[0]).toMatchObject({ venue: "okx", base: "SOL", quote: "USDT", bid: 150, askSize: 4, ts: 11 });
    const perps = parseOkxPerps(
      { code: "0", data: [{ instId: "SOL-USDT-SWAP", bidPx: "150.2", askPx: "150.3", ts: "12" }, { instId: "SOL-USD-SWAP", bidPx: "1", askPx: "2" }, { instId: "SOL-USDT-260327", bidPx: "1", askPx: "2" }] },
      { code: "0", data: [{ instId: "SOL-USDT-SWAP", fundingRate: "0.0003", fundingTime: "1800000000000", nextFundingTime: "1800014400000" }] },
    );
    expect(perps).toHaveLength(1);
    expect(perps[0]).toMatchObject({ base: "SOL", quote: "USDT", fundingRate: 0.0003, fundingIntervalHours: 4 });
    const ob = parseOkxOrderBook({ code: "0", data: [{ asks: [["150.3", "1", "0", "1"]], bids: [["150.2", "2", "0", "1"]], ts: "13" }] }, "SOL", "USDT");
    expect(ob.asks[0]).toEqual({ price: 150.3, size: 1 });
    expect(() => parseOkxSpotTickers({ code: "50011", msg: "rate limit" })).toThrow(/50011/);
  });
});

describe("live scan with a mocked network", () => {
  const routes: Record<string, unknown> = {
    "/api/v2/spot/market/tickers": { code: "00000", data: [{ symbol: "SOLUSDT", bidPr: "149.9", askPr: "150", bidSz: "100", askSz: "100" }] },
    "/api/v2/mix/market/tickers": { code: "00000", data: [] },
    "/api/v2/mix/market/contracts": { code: "00000", data: [] },
    "/api/v2/spot/public/coins": { code: "00000", data: [{ coin: "SOL", chains: [{ withdrawFee: "0.02", withdrawable: "true", withdrawConfirm: "1" }] }] },
    "/api/v5/market/tickers?instType=SPOT": { code: "0", data: [{ instId: "SOL-USDT", bidPx: "150.5", askPx: "150.6", bidSz: "50", askSz: "50" }] },
    "/api/v5/market/tickers?instType=SWAP": { code: "0", data: [] },
    "/api/v5/public/funding-rate": { code: "0", data: [] },
    "/api/v5/market/books": { code: "0", data: [{ asks: [["150.6", "50"]], bids: [["150.5", "20"], ["150.45", "40"]], ts: "1" }] },
    "/api/v2/spot/market/orderbook": { code: "00000", data: { asks: [["150", "60"], ["150.05", "60"]], bids: [["149.9", "100"]] } },
  };
  const fetchFn: FetchLike = async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => JSON.stringify(routes[hit]) };
  };

  it("tolerates failing venues, applies live withdrawal fees and depth re-pricing", async () => {
    const r = await scan({ venues: ["bitget", "okx"], fetchFn, depthTop: 1, notionalQuote: 4_500, now: NOW });
    expect(r.quoteCounts).toEqual({ bitget: 1, okx: 1 });
    expect(r.errors).toEqual([]);
    const [o] = r.crossExchange;
    expect(o.buyVenue).toBe("bitget");
    expect(o.sellVenue).toBe("okx");
    expect(o.depthChecked).toBe(true);
    expect(o.sellPrice).toBeLessThan(150.5); // 30 SOL: 20 fill at 150.5, the rest at 150.45
    // transfer estimate uses the live 0.02 SOL fee: 0.02 / 30 SOL ≈ 6.7 bps
    expect(o.netBps - o.netAfterTransferBps!).toBeCloseTo((0.02 / 30) * 1e4, 0);
  });

  it("reports an error and zero quotes for an unreachable venue", async () => {
    const r = await scan({ venues: ["binance"], fetchFn, now: NOW });
    expect(r.quoteCounts.binance).toBe(0);
    expect(r.errors.some((e) => e.startsWith("binance spot"))).toBe(true);
  });

  it("every adapter exposes spot/perps/orderBook", () => {
    for (const a of Object.values(ADAPTERS)) {
      expect(typeof a.spot).toBe("function");
      expect(typeof a.perps).toBe("function");
      expect(typeof a.orderBook).toBe("function");
    }
  });
});
