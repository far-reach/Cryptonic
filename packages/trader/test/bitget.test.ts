import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { BitgetExchange, fetchBitgetKlines, fetchBitgetRules } from "../src/bitget.js";
import { loadConfig } from "../src/config.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ code: "00000", msg: "success", data }),
});

const SYMBOLS = [
  { symbol: "BTCUSDT", pricePrecision: "2", quantityPrecision: "6", minTradeUSDT: "1" },
];

function bitgetCfg() {
  const cfg = loadConfig();
  cfg.exchange = "bitget";
  return cfg;
}

describe("Bitget adapter", () => {
  beforeEach(() => {
    process.env.BITGET_API_KEY = "test-key";
    process.env.BITGET_API_SECRET = "test-secret";
    process.env.BITGET_API_PASSPHRASE = "test-pass";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps precision counts to tick/step sizes and floors minNotional at 1", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(SYMBOLS)));
    const rules = await fetchBitgetRules("https://api.bitget.com", "BTCUSDT");
    expect(rules.tickSize).toBeCloseTo(0.01, 10);
    expect(rules.stepSize).toBeCloseTo(0.000001, 12);
    expect(rules.minNotional).toBe(1);
  });

  it("parses candles into Klines sorted by openTime", async () => {
    const rows = [
      ["1752400000000", "64000", "64100", "63900", "64050", "10", "640000", "640000"],
      ["1752396400000", "63900", "64000", "63800", "64000", "12", "760000", "760000"],
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(rows)));
    const klines = await fetchBitgetKlines("https://api.bitget.com", "BTCUSDT", "1h", 2);
    expect(klines).toHaveLength(2);
    expect(klines[0].openTime).toBeLessThan(klines[1].openTime);
    expect(klines[1].close).toBe(64050);
    expect(klines[0].closeTime - klines[0].openTime).toBe(3_599_999);
  });

  it("signs requests with base64 HMAC over ts+METHOD+path+query+body and sends the passphrase", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ url, init: init ?? {} });
        if (url.includes("/public/symbols")) return ok(SYMBOLS);
        if (url.includes("/place-order")) return ok({ orderId: "111", clientOid: "grid-buy-0" });
        throw new Error(`unexpected url ${url}`);
      }),
    );
    const ex = await BitgetExchange.connect(bitgetCfg());
    await ex.placeLimit({ symbol: "BTCUSDT", side: "BUY", price: 60_000, qty: 0.00037, clientId: "grid-buy-0" });

    const place = calls.find((c) => c.url.includes("place-order"))!;
    const headers = place.init.headers as Record<string, string>;
    const body = place.init.body as string;
    expect(headers["ACCESS-KEY"]).toBe("test-key");
    expect(headers["ACCESS-PASSPHRASE"]).toBe("test-pass");
    const expected = createHmac("sha256", "test-secret")
      .update(headers["ACCESS-TIMESTAMP"] + "POST" + "/api/v2/spot/trade/place-order" + body)
      .digest("base64");
    expect(headers["ACCESS-SIGN"]).toBe(expected);
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ side: "buy", orderType: "limit", force: "gtc", clientOid: "grid-buy-0" });
  });

  it("drains a fill once the order leaves the open set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/public/symbols")) return ok(SYMBOLS);
        if (url.includes("/place-order")) return ok({ orderId: "222" });
        if (url.includes("/unfilled-orders")) return ok([]);
        if (url.includes("/orderInfo"))
          return ok([
            {
              orderId: "222",
              clientOid: "grid-buy-1",
              side: "buy",
              price: "60000",
              size: "0.0003",
              status: "filled",
              baseVolume: "0.0003",
              quoteVolume: "18",
              cTime: "1752400000000",
              uTime: "1752400300000",
            },
          ]);
        throw new Error(`unexpected url ${url}`);
      }),
    );
    const ex = await BitgetExchange.connect(bitgetCfg());
    await ex.placeLimit({ symbol: "BTCUSDT", side: "BUY", price: 60_000, qty: 0.0003, clientId: "grid-buy-1" });
    const fills = await ex.drainFills();
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({
      status: "FILLED",
      side: "BUY",
      clientId: "grid-buy-1",
      executedQty: 0.0003,
      executedQuote: 18,
    });
    // buys pay fees in BASE (no feeDetail in mock -> configured-rate fallback)
    expect(fills[0].feeQuote).toBe(0);
    expect(fills[0].feeBase).toBeCloseTo(0.0003 * 0.001, 12);
    // second drain is empty — the order is no longer tracked
    expect(await ex.drainFills()).toHaveLength(0);
  });

  it("parses real fees from feeDetail when present", async () => {
    const { parseFeeDetail } = await import("../src/bitget.js");
    expect(parseFeeDetail('{"BTC":{"totalFee":"-0.0000003"}}', "BTC")).toBeCloseTo(0.0000003, 12);
    expect(parseFeeDetail('{"newFees":{"t":-0.018}}', "USDT")).toBeCloseTo(0.018, 9);
    expect(parseFeeDetail("not-json", "BTC")).toBeUndefined();
    expect(parseFeeDetail(undefined, "BTC")).toBeUndefined();
  });

  it("surfaces Bitget error codes instead of silently succeeding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/public/symbols")) return ok(SYMBOLS);
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: "43011", msg: "The parameter does not meet the specification", data: null }),
        };
      }),
    );
    const ex = await BitgetExchange.connect(bitgetCfg());
    await expect(
      ex.placeLimit({ symbol: "BTCUSDT", side: "BUY", price: 60_000, qty: 0.0003, clientId: "grid-buy-2" }),
    ).rejects.toThrow(/43011/);
  });
});
