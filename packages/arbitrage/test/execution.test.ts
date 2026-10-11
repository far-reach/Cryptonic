import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bitgetClient,
  binanceClient,
  bybitClient,
  checkLive,
  credentialsFromEnv,
  DEFAULT_RISK,
  executeCrossExchange,
  findCrossExchange,
  floorToStep,
  halt,
  numStr,
  okxClient,
  planCrossExchange,
  preflight,
  roundPrice,
  sampleQuotes,
  signBinance,
  signBitget,
  signBybit,
  signOkx,
  type CrossExchangeOpportunity,
  type ExchangeClient,
  type FetchLike,
  type OrderRequest,
  type SymbolRules,
} from "../src/index.js";

const NOW = 1_800_000_000_000;
const creds = { apiKey: "key", apiSecret: "secret", passphrase: "pass" };
const tmp = () => mkdtempSync(join(tmpdir(), "arb-exec-"));
const hex = (m: string) => createHmac("sha256", "secret").update(m).digest("hex");
const b64 = (m: string) => createHmac("sha256", "secret").update(m).digest("base64");

describe("rounding helpers", () => {
  it("floors quantities to the lot step and rounds prices toward crossing", () => {
    expect(floorToStep(1.23456, 0.01)).toBe(1.23);
    expect(floorToStep(1.23456, 0)).toBe(1.23456);
    expect(roundPrice(150.0231, 0.01, "buy")).toBe(150.03);
    expect(roundPrice(150.0291, 0.01, "sell")).toBe(150.02);
    expect(numStr(0.00001)).toBe("0.00001");
    expect(numStr(150)).toBe("150");
    expect(numStr(1.5e-7)).toBe("0.00000015");
  });
});

describe("request signing", () => {
  const req: OrderRequest = { venue: "bitget", base: "SOL", quote: "USDT", side: "buy", price: 150.05, amountBase: 1.33, clientOrderId: "c1" };

  it("bitget: base64 HMAC of ts+METHOD+path+body with passphrase header", () => {
    const s = bitgetClient(creds, { now: () => NOW }).signPlaceOrder(req, NOW);
    expect(s.url).toBe("https://api.bitget.com/api/v2/spot/trade/place-order");
    expect(JSON.parse(s.body!)).toMatchObject({ symbol: "SOLUSDT", side: "buy", orderType: "limit", force: "ioc", price: "150.05", size: "1.33", clientOid: "c1" });
    expect(s.headers["ACCESS-SIGN"]).toBe(b64(`${NOW}POST/api/v2/spot/trade/place-order${s.body}`));
    expect(s.headers["ACCESS-PASSPHRASE"]).toBe("pass");
    const g = signBitget(creds, "GET", "/api/v2/spot/account/assets?coin=USDT", "", NOW);
    expect(g.headers["ACCESS-SIGN"]).toBe(b64(`${NOW}GET/api/v2/spot/account/assets?coin=USDT`));
    expect(g.body).toBeUndefined();
  });

  it("binance: hex HMAC of the query string appended as signature", () => {
    const s = binanceClient(creds).signPlaceOrder({ ...req, venue: "binance" }, NOW);
    const url = new URL(s.url);
    const qs = url.search.slice(1).replace(/&signature=.*$/, "");
    expect(url.searchParams.get("signature")).toBe(hex(qs));
    expect(url.searchParams.get("timeInForce")).toBe("IOC");
    expect(url.searchParams.get("type")).toBe("LIMIT");
    expect(url.searchParams.get("side")).toBe("BUY");
    expect(s.headers["X-MBX-APIKEY"]).toBe("key");
    expect(s.body).toBeUndefined();
    expect(signBinance(creds, "GET", "/api/v3/account", {}, NOW).url).toContain("timestamp=1800000000000");
  });

  it("bybit: hex HMAC of ts+key+recvWindow+body", () => {
    const s = bybitClient(creds).signPlaceOrder({ ...req, venue: "bybit" }, NOW);
    expect(JSON.parse(s.body!)).toMatchObject({ category: "spot", symbol: "SOLUSDT", side: "Buy", orderType: "Limit", timeInForce: "IOC", qty: "1.33", price: "150.05" });
    expect(s.headers["X-BAPI-SIGN"]).toBe(hex(`${NOW}key5000${s.body}`));
    const g = signBybit(creds, "GET", "/v5/order/realtime", "category=spot&orderId=1", NOW);
    expect(g.url).toBe("https://api.bybit.com/v5/order/realtime?category=spot&orderId=1");
    expect(g.headers["X-BAPI-SIGN"]).toBe(hex(`${NOW}key5000category=spot&orderId=1`));
  });

  it("okx: base64 HMAC of isoTs+METHOD+path+body", () => {
    const s = okxClient(creds).signPlaceOrder({ ...req, venue: "okx" }, NOW);
    const iso = new Date(NOW).toISOString();
    expect(JSON.parse(s.body!)).toMatchObject({ instId: "SOL-USDT", tdMode: "cash", side: "buy", ordType: "ioc", px: "150.05", sz: "1.33" });
    expect(s.headers["OK-ACCESS-TIMESTAMP"]).toBe(iso);
    expect(s.headers["OK-ACCESS-SIGN"]).toBe(b64(`${iso}POST/api/v5/trade/order${s.body}`));
    expect(signOkx(creds, "GET", "/api/v5/account/balance?ccy=USDT", "", NOW).headers["OK-ACCESS-SIGN"]).toBe(b64(`${iso}GET/api/v5/account/balance?ccy=USDT`));
  });
});

describe("client response parsing (mocked network)", () => {
  const mock =
    (routes: Record<string, unknown>): FetchLike =>
    async (url) => {
      const hit = Object.keys(routes).find((k) => url.includes(k));
      return { ok: !!hit, status: hit ? 200 : 404, text: async () => JSON.stringify(hit ? routes[hit] : { error: "nope" }) };
    };
  const req: OrderRequest = { venue: "bitget", base: "SOL", quote: "USDT", side: "buy", price: 150, amountBase: 2, clientOrderId: "c" };

  it("bitget place → orderInfo, balances, symbol rules", async () => {
    const c = bitgetClient(creds, {
      fetchFn: mock({
        "place-order": { code: "00000", data: { orderId: "o1" } },
        orderInfo: { code: "00000", data: [{ orderId: "o1", status: "filled", baseVolume: "2", quoteVolume: "300.2" }] },
        "account/assets": { code: "00000", data: [{ coin: "USDT", available: "500.5" }] },
        "public/symbols": { code: "00000", data: [{ quantityPrecision: "2", pricePrecision: "3", minTradeUSDT: "1" }] },
      }),
    });
    const r = await c.placeOrder(req);
    expect(r).toMatchObject({ status: "filled", filledBase: 2, filledQuote: 300.2, avgPrice: 150.1 });
    expect((await c.getBalance("USDT")).available).toBe(500.5);
    expect(await c.getSymbolRules("SOL", "USDT")).toEqual({ lotStep: 0.01, tickSize: 0.001, minNotional: 1 });
  });

  it("binance FULL response with quote-denominated fees, exchangeInfo filters", async () => {
    const c = binanceClient(creds, {
      fetchFn: mock({
        "/api/v3/order": { symbol: "SOLUSDT", orderId: 7, status: "EXPIRED", executedQty: "1.5", cummulativeQuoteQty: "225", fills: [{ price: "150", qty: "1.5", commission: "0.225", commissionAsset: "USDT" }] },
        "/api/v3/account": { balances: [{ asset: "SOL", free: "3", locked: "0" }] },
        exchangeInfo: { symbols: [{ filters: [{ filterType: "PRICE_FILTER", tickSize: "0.01" }, { filterType: "LOT_SIZE", stepSize: "0.001" }, { filterType: "NOTIONAL", minNotional: "5" }] }] },
      }),
    });
    const r = await c.placeOrder({ ...req, venue: "binance" });
    expect(r).toMatchObject({ status: "partial", filledBase: 1.5, avgPrice: 150, feeQuote: 0.225, orderId: "7" });
    expect((await c.getBalance("SOL")).available).toBe(3);
    expect(await c.getSymbolRules("SOL", "USDT")).toEqual({ lotStep: 0.001, tickSize: 0.01, minNotional: 5 });
  });

  it("bybit falls back to order history for settled IOC orders; unified balances", async () => {
    const c = bybitClient(creds, {
      fetchFn: mock({
        "order/create": { retCode: 0, result: { orderId: "b1" } },
        "order/realtime": { retCode: 0, result: { list: [] } },
        "order/history": { retCode: 0, result: { list: [{ orderId: "b1", orderStatus: "PartiallyFilledCanceled", cumExecQty: "0.5", cumExecValue: "75", cumExecFee: "0.075" }] } },
        "wallet-balance": { retCode: 0, result: { list: [{ coin: [{ coin: "USDT", walletBalance: "100", locked: "10", availableToWithdraw: "" }] }] } },
        "instruments-info": { retCode: 0, result: { list: [{ lotSizeFilter: { basePrecision: "0.01", minOrderAmt: "1" }, priceFilter: { tickSize: "0.001" } }] } },
      }),
    });
    const r = await c.placeOrder({ ...req, venue: "bybit" });
    expect(r).toMatchObject({ status: "partial", filledBase: 0.5, avgPrice: 150, feeQuote: 0.075 });
    expect((await c.getBalance("USDT")).available).toBe(90);
    expect(await c.getSymbolRules("SOL", "USDT")).toEqual({ lotStep: 0.01, tickSize: 0.001, minNotional: 1 });
  });

  it("okx surfaces per-order sCode errors and parses fills/balances/instruments", async () => {
    const ok = okxClient(creds, {
      fetchFn: mock({
        "trade/order?": { code: "0", data: [{ ordId: "k1", state: "filled", accFillSz: "2", avgPx: "150.2", fee: "-0.3", feeCcy: "USDT", instId: "SOL-USDT" }] },
        "trade/order": { code: "0", data: [{ ordId: "k1", sCode: "0" }] },
        "account/balance": { code: "0", data: [{ details: [{ ccy: "USDT", availBal: "42" }] }] },
        "public/instruments": { code: "0", data: [{ lotSz: "0.001", tickSz: "0.01", minSz: "0.01" }] },
      }),
    });
    const r = await ok.placeOrder({ ...req, venue: "okx" });
    expect(r).toMatchObject({ status: "filled", filledBase: 2, avgPrice: 150.2, feeQuote: 0.3 });
    expect((await ok.getBalance("USDT")).available).toBe(42);
    expect((await ok.getSymbolRules("SOL", "USDT")).lotStep).toBe(0.001);
    const bad = okxClient(creds, { fetchFn: mock({ "trade/order": { code: "0", data: [{ sCode: "51008", sMsg: "insufficient balance" }] } }) });
    await expect(bad.placeOrder({ ...req, venue: "okx" })).rejects.toThrow(/51008/);
  });

  it("reads credentials only for fully configured venues", () => {
    const env = { BITGET_API_KEY: "a", BITGET_API_SECRET: "b", BINANCE_API_KEY: "a", BINANCE_API_SECRET: "b", OKX_API_KEY: "a", OKX_API_SECRET: "b", OKX_API_PASSPHRASE: "p" };
    expect(Object.keys(credentialsFromEnv(env)).sort()).toEqual(["binance", "okx"]); // bitget lacks its passphrase
  });
});

describe("executor", () => {
  const rules: SymbolRules = { lotStep: 0.01, tickSize: 0.01, minNotional: 5 };
  const sol = (): CrossExchangeOpportunity => ({
    kind: "cross-exchange",
    base: "SOL",
    quote: "USDT",
    buyVenue: "bitget",
    sellVenue: "okx",
    buyPrice: 150,
    sellPrice: 150.4,
    notionalQuote: 1_000,
    maxNotionalQuote: 5_000,
    grossBps: 26.67,
    feesBps: 20,
    netBps: 6.67,
    suspicious: false,
    depthChecked: true,
    quoteAgeMs: 100,
  });

  it("plans paired IOC limits with slippage tolerance, lot rounding and the risk cap", () => {
    const plan = planCrossExchange(sol(), rules, rules, { ...DEFAULT_RISK, maxNotionalQuote: 300, slippageToleranceBps: 10 });
    expect(plan.buy.price).toBe(150.15);
    expect(plan.sell.price).toBe(150.24); // 150.4 × (1 − 10 bps) floored to the tick
    expect(plan.amountBase).toBe(1.99); // 300 / 150.15 floored to 0.01
    expect(plan.buy.amountBase).toBe(plan.sell.amountBase);
    expect(plan.expectedPnlQuote).toBeCloseTo(1.99 * 0.09 - (1.99 * (150.15 + 150.24) * 20) / 2 / 1e4, 2);
    expect(preflight(plan, { ...DEFAULT_RISK, maxNotionalQuote: 300, slippageToleranceBps: 10 }, rules, rules, tmp(), NOW)).toEqual([
      "expected P&L after fees is not positive",
    ]);
  });

  it("refuses thin, stale, suspicious, un-depth-checked or halted trades", () => {
    const dir = tmp();
    const risk = { ...DEFAULT_RISK, slippageToleranceBps: 1 };
    const good = planCrossExchange({ ...sol(), netBps: 12, sellPrice: 150.5 }, rules, rules, risk);
    expect(preflight(good, risk, rules, rules, dir, NOW)).toEqual([]);
    expect(preflight(planCrossExchange({ ...sol(), suspicious: true }, rules, rules, risk), risk, rules, rules, dir, NOW)).toContain("opportunity flagged suspicious");
    expect(preflight(planCrossExchange({ ...sol(), depthChecked: false }, rules, rules, risk), risk, rules, rules, dir, NOW)).toContain("not depth-checked (run with --depth)");
    expect(preflight(planCrossExchange({ ...sol(), quoteAgeMs: 60_000 }, rules, rules, risk), risk, rules, rules, dir, NOW)).toContain("quotes 60000 ms old");
    halt(dir, "test");
    expect(preflight(good, risk, rules, rules, dir, NOW)[0]).toMatch(/kill switch/);
  });

  const fake = (venue: "bitget" | "okx", fill: (req: OrderRequest) => number, balance = 1e9): ExchangeClient => ({
    venue,
    signPlaceOrder: () => ({ method: "POST", url: "x", headers: {} }),
    async placeOrder(req) {
      const filled = fill(req);
      return { venue, orderId: "1", status: filled === req.amountBase ? "filled" : filled > 0 ? "partial" : "cancelled", filledBase: filled, filledQuote: filled * req.price, avgPrice: req.price };
    },
    async getOrder() {
      throw new Error("unused");
    },
    async getBalance(asset) {
      return { asset, available: balance };
    },
    async getSymbolRules() {
      return rules;
    },
  });

  it("dry-run never calls placeOrder and records the plan", async () => {
    const dir = tmp();
    let called = 0;
    const client = fake("bitget", (r) => (called++, r.amountBase));
    const report = await executeCrossExchange({ ...sol(), netBps: 12, sellPrice: 150.5 }, { clients: { bitget: client, okx: { ...fake("okx", (r) => r.amountBase), venue: "okx" } }, stateDir: dir });
    expect(report.mode).toBe("dry-run");
    expect(called).toBe(0);
    expect(report.refused).toEqual(["dry-run"]);
    expect(readFileSync(join(dir, "trades.jsonl"), "utf8")).toContain('"mode":"dry-run"');
    expect(readFileSync(join(dir, "trades.jsonl"), "utf8")).not.toContain("ACCESS-SIGN");
  });

  it("live: both legs fill → realised P&L, no halt", async () => {
    const dir = tmp();
    const report = await executeCrossExchange(
      { ...sol(), netBps: 12, sellPrice: 150.5 },
      { clients: { bitget: fake("bitget", (r) => r.amountBase), okx: fake("okx", (r) => r.amountBase) }, stateDir: dir, live: true, risk: { ...DEFAULT_RISK, slippageToleranceBps: 1 } },
    );
    expect(report.mode).toBe("live");
    expect(report.refused).toBeUndefined();
    expect(report.unhedgedBase).toBe(0);
    expect(report.realisedPnlQuote!).toBeGreaterThan(0);
    expect(report.halted).toBeUndefined();
    expect(existsSync(join(dir, "HALT"))).toBe(false);
  });

  it("live: one leg fails to fill → unhedged leftover, kill switch written", async () => {
    const dir = tmp();
    const report = await executeCrossExchange(
      { ...sol(), netBps: 12, sellPrice: 150.5 },
      { clients: { bitget: fake("bitget", (r) => r.amountBase), okx: fake("okx", () => 0) }, stateDir: dir, live: true, risk: { ...DEFAULT_RISK, slippageToleranceBps: 1 } },
    );
    expect(report.unhedgedBase).toBeGreaterThan(0);
    expect(report.halted).toBe(true);
    expect(readFileSync(join(dir, "HALT"), "utf8")).toMatch(/unhedged/);
    // and the next attempt is refused by preflight
    const next = await executeCrossExchange({ ...sol(), netBps: 12, sellPrice: 150.5 }, { clients: { bitget: fake("bitget", (r) => r.amountBase), okx: fake("okx", (r) => r.amountBase) }, stateDir: dir, live: true });
    expect(next.refused![0]).toMatch(/kill switch/);
  });

  it("live: insufficient balance is refused before any order", async () => {
    const dir = tmp();
    let called = 0;
    const report = await executeCrossExchange(
      { ...sol(), netBps: 12, sellPrice: 150.5 },
      { clients: { bitget: fake("bitget", (r) => (called++, r.amountBase), 1), okx: fake("okx", (r) => r.amountBase) }, stateDir: dir, live: true, risk: { ...DEFAULT_RISK, slippageToleranceBps: 1 } },
    );
    expect(called).toBe(0);
    expect(report.refused![0]).toMatch(/balance/);
  });

  it("checkLive requires the acknowledgement, keys and a passed gate (or an explicit override)", () => {
    const dir = tmp();
    const base = { stateDir: dir, venues: ["bitget", "okx"] as ("bitget" | "okx")[], now: NOW };
    expect(checkLive({ ...base, env: {} }).reasons.join()).toMatch(/ARB_LIVE/);
    const keys = { BITGET_API_KEY: "a", BITGET_API_SECRET: "b", BITGET_API_PASSPHRASE: "c", OKX_API_KEY: "a", OKX_API_SECRET: "b", OKX_API_PASSPHRASE: "c" };
    const r = checkLive({ ...base, env: { ARB_LIVE: "I_ACCEPT_THE_RISK", ...keys } });
    expect(r.allowed).toBe(false);
    expect(r.reasons.join()).toMatch(/paper gate/);
    const o = checkLive({ ...base, env: { ARB_LIVE: "I_ACCEPT_THE_RISK", ARB_OVERRIDE_GATE: "1", ...keys } });
    expect(o.allowed).toBe(true);
    expect(o.gateOverridden).toBe(true);
    writeFileSync(join(dir, "HALT"), "x");
  });
});
