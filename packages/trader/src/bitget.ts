import { createHmac } from "node:crypto";
import type { Balances, Exchange, Kline, Order, OrderRequest, SymbolRules } from "./types.js";
import type { TraderConfig } from "./config.js";

/**
 * Bitget spot v2 adapter implementing the same `Exchange` interface as the
 * Binance client and the paper simulator — strategy/risk code is unchanged.
 *
 * Bitget specifics vs Binance:
 *  - Auth: HMAC-SHA256 over (timestamp + METHOD + path + query + body),
 *    base64-encoded, sent with an additional API *passphrase* header.
 *  - Precision comes as decimal-place counts (pricePrecision=2), converted
 *    here to tick/step sizes; min order value is `minTradeUSDT`.
 *  - Responses are enveloped: { code:"00000", msg, data }.
 *  - There is NO spot testnet: first live runs must be canary-sized.
 */

const OK = "00000";

interface RawBitgetOrder {
  orderId: string | number;
  clientOid?: string;
  side?: string; // buy | sell
  price?: string;
  priceAvg?: string;
  size?: string;
  status?: string; // live | partially_filled | filled | cancelled
  baseVolume?: string;
  quoteVolume?: string;
  cTime?: string;
  uTime?: string;
  feeDetail?: string;
}

export class BitgetExchange implements Exchange {
  /** clientOid -> orderId for orders we placed and still consider open. */
  private tracked = new Map<string, string>();

  private constructor(
    private readonly cfg: TraderConfig,
    readonly rules: SymbolRules,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly passphrase: string,
  ) {}

  static async connect(cfg: TraderConfig): Promise<BitgetExchange> {
    const key = process.env[cfg.bitget.apiKeyEnv];
    const secret = process.env[cfg.bitget.apiSecretEnv];
    const pass = process.env[cfg.bitget.passphraseEnv];
    if (!key || !secret || !pass)
      throw new Error(
        `missing Bitget credentials: set ${cfg.bitget.apiKeyEnv}, ${cfg.bitget.apiSecretEnv} and ${cfg.bitget.passphraseEnv}`,
      );
    const rules = await fetchBitgetRules(cfg.bitget.baseUrl, cfg.symbol);
    return new BitgetExchange(cfg, rules, key, secret, pass);
  }

  // ---- Exchange interface -------------------------------------------------

  async lastPrice(): Promise<number> {
    return fetchBitgetPrice(this.cfg.bitget.baseUrl, this.cfg.symbol);
  }

  async balances(): Promise<Balances> {
    const data = await this.request<
      { coin: string; available: string; frozen: string; locked: string }[]
    >("GET", "/api/v2/spot/account/assets", {});
    const find = (coin: string) => data.find((a) => a.coin === coin);
    const q = find(this.cfg.quoteAsset);
    const b = find(this.cfg.baseAsset);
    const lockedOf = (a?: { frozen: string; locked: string }) =>
      a ? Number(a.frozen ?? 0) + Number(a.locked ?? 0) : 0;
    return {
      quote: Number(q?.available ?? 0),
      base: Number(b?.available ?? 0),
      lockedQuote: lockedOf(q),
      lockedBase: lockedOf(b),
    };
  }

  async openOrders(): Promise<Order[]> {
    const data = await this.request<RawBitgetOrder[]>("GET", "/api/v2/spot/trade/unfilled-orders", {
      query: { symbol: this.cfg.symbol },
    });
    return (data ?? []).map((o) => this.toOrder(o, "NEW"));
  }

  async drainFills(): Promise<Order[]> {
    if (this.tracked.size === 0) return [];
    const open = new Set((await this.openOrders()).map((o) => o.orderId));
    const out: Order[] = [];
    for (const [clientOid, orderId] of [...this.tracked]) {
      if (open.has(orderId)) continue;
      const order = await this.orderInfo({ orderId });
      if (!order) {
        this.tracked.delete(clientOid);
        continue;
      }
      if (order.status === "FILLED" || order.status === "CANCELED") {
        this.tracked.delete(clientOid);
        out.push(order);
      }
    }
    return out;
  }

  async placeLimit(req: OrderRequest): Promise<Order> {
    const data = await this.request<{ orderId: string | number; clientOid?: string }>(
      "POST",
      "/api/v2/spot/trade/place-order",
      {
        body: {
          symbol: req.symbol,
          side: req.side.toLowerCase(),
          orderType: "limit",
          force: "gtc",
          price: String(req.price),
          size: String(req.qty),
          clientOid: req.clientId,
        },
      },
    );
    const orderId = String(data.orderId);
    this.tracked.set(req.clientId, orderId);
    return {
      ...req,
      orderId,
      status: "NEW",
      executedQty: 0,
      executedQuote: 0,
      feeQuote: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /** Re-arm fill tracking after a restart (terminal orders surface via drainFills). */
  async trackByClientId(clientOid: string): Promise<void> {
    try {
      const data = await this.request<RawBitgetOrder[] | RawBitgetOrder>(
        "GET",
        "/api/v2/spot/trade/orderInfo",
        { query: { clientOid } },
      );
      const raw = Array.isArray(data) ? data[0] : data;
      if (raw) this.tracked.set(clientOid, String(raw.orderId));
    } catch {
      // unknown order — nothing to track
    }
  }

  async cancel(orderId: string): Promise<void> {
    await this.request("POST", "/api/v2/spot/trade/cancel-order", {
      body: { symbol: this.cfg.symbol, orderId },
    });
  }

  async cancelAll(): Promise<void> {
    const open = await this.openOrders();
    // Only the bot's own orders (grid-* client ids) — never manual ones.
    for (const o of open) {
      if (o.clientId.startsWith("grid-")) await this.cancel(o.orderId);
    }
  }

  async marketSell(qty: number): Promise<Order> {
    const clientOid = `grid-stop-${Date.now()}`;
    const data = await this.request<{ orderId: string | number }>(
      "POST",
      "/api/v2/spot/trade/place-order",
      {
        body: {
          symbol: this.cfg.symbol,
          side: "sell",
          orderType: "market",
          // Bitget market SELL sizes in BASE units (market BUY would be quote).
          size: String(qty),
          clientOid,
        },
      },
    );
    // Market orders fill near-instantly; poll order info briefly for real fills.
    const orderId = String(data.orderId);
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1_000));
      const order = await this.orderInfo({ orderId });
      if (order && order.status === "FILLED") return order;
    }
    // Fall back to an estimate so the caller can still account for the exit.
    const price = await this.lastPrice();
    return {
      symbol: this.cfg.symbol,
      side: "SELL",
      price,
      qty,
      clientId: clientOid,
      orderId,
      status: "FILLED",
      executedQty: qty,
      executedQuote: price * qty,
      feeQuote: price * qty * this.cfg.risk.feeRate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // ---- plumbing -----------------------------------------------------------

  private async orderInfo(idParam: { orderId?: string; clientOid?: string }): Promise<Order | undefined> {
    const data = await this.request<RawBitgetOrder[] | RawBitgetOrder>(
      "GET",
      "/api/v2/spot/trade/orderInfo",
      { query: idParam as Record<string, string> },
    );
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return undefined;
    const status =
      raw.status === "filled" ? "FILLED" : raw.status === "cancelled" || raw.status === "canceled" ? "CANCELED" : "NEW";
    return this.toOrder(raw, status);
  }

  private toOrder(raw: RawBitgetOrder, status: Order["status"]): Order {
    const executedQuote = Number(raw.quoteVolume ?? 0);
    const side: Order["side"] = raw.side
      ? (raw.side.toUpperCase() as Order["side"])
      : (raw.clientOid ?? "").includes("sell") || (raw.clientOid ?? "").includes("stop")
        ? "SELL"
        : "BUY";
    return {
      symbol: this.cfg.symbol,
      side,
      price: Number(raw.price ?? raw.priceAvg ?? 0),
      qty: Number(raw.size ?? 0),
      clientId: raw.clientOid ?? "",
      orderId: String(raw.orderId),
      status,
      executedQty: Number(raw.baseVolume ?? 0),
      executedQuote,
      // feeDetail parsing is venue-noise; assume the standard spot fee so PnL
      // accounting stays conservative (Bitget spot base fee is 0.1%).
      feeQuote: executedQuote * this.cfg.risk.feeRate,
      createdAt: Number(raw.cTime ?? 0),
      updatedAt: Number(raw.uTime ?? raw.cTime ?? 0),
    };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { query?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    const query = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
    const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
    const ts = String(Date.now());
    const prehash = ts + method + path + query + bodyStr;
    const sign = createHmac("sha256", this.apiSecret).update(prehash).digest("base64");
    const res = await fetch(`${this.cfg.bitget.baseUrl.replace(/\/$/, "")}${path}${query}`, {
      method,
      headers: {
        "ACCESS-KEY": this.apiKey,
        "ACCESS-SIGN": sign,
        "ACCESS-TIMESTAMP": ts,
        "ACCESS-PASSPHRASE": this.passphrase,
        "Content-Type": "application/json",
      },
      body: bodyStr || undefined,
    });
    const json = (await res.json().catch(() => ({ code: String(res.status), msg: "unparseable response", data: null }))) as {
      code: string;
      msg: string;
      data: T;
    };
    if (!res.ok || json.code !== OK)
      throw new Error(`Bitget ${method} ${path} -> HTTP ${res.status} code ${json.code}: ${json.msg}`);
    return json.data;
  }
}

// ---- public (unsigned) market data ---------------------------------------

const GRANULARITY: Record<string, { g: string; ms: number }> = {
  "1m": { g: "1min", ms: 60_000 },
  "5m": { g: "5min", ms: 300_000 },
  "15m": { g: "15min", ms: 900_000 },
  "30m": { g: "30min", ms: 1_800_000 },
  "1h": { g: "1h", ms: 3_600_000 },
  "4h": { g: "4h", ms: 14_400_000 },
  "1d": { g: "1day", ms: 86_400_000 },
};

async function publicGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  const json = (await res.json().catch(() => ({ code: String(res.status), msg: "unparseable", data: null }))) as {
    code: string;
    msg: string;
    data: T;
  };
  if (!res.ok || json.code !== OK) throw new Error(`Bitget GET ${path} -> ${res.status}/${json.code}: ${json.msg}`);
  return json.data;
}

export async function fetchBitgetKlines(
  baseUrl: string,
  symbol: string,
  interval: string,
  limit: number,
): Promise<Kline[]> {
  const g = GRANULARITY[interval];
  if (!g) throw new Error(`unsupported interval for Bitget: ${interval}`);
  const data = await publicGet<string[][]>(
    baseUrl,
    `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${g.g}&limit=${limit}`,
  );
  return (data ?? [])
    .map((k) => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5] ?? 0),
      closeTime: Number(k[0]) + g.ms - 1,
    }))
    .sort((a, b) => a.openTime - b.openTime);
}

export async function fetchBitgetPrice(baseUrl: string, symbol: string): Promise<number> {
  const data = await publicGet<{ lastPr: string }[]>(baseUrl, `/api/v2/spot/market/tickers?symbol=${symbol}`);
  const t = data?.[0];
  if (!t) throw new Error(`no Bitget ticker for ${symbol}`);
  return Number(t.lastPr);
}

export async function fetchBitgetRules(baseUrl: string, symbol: string): Promise<SymbolRules> {
  const data = await publicGet<
    { symbol: string; pricePrecision: string; quantityPrecision: string; minTradeUSDT?: string }[]
  >(baseUrl, `/api/v2/spot/public/symbols?symbol=${symbol}`);
  const s = data?.find((x) => x.symbol === symbol) ?? data?.[0];
  if (!s) throw new Error(`symbol ${symbol} not found on Bitget`);
  return {
    tickSize: Math.pow(10, -Number(s.pricePrecision)),
    stepSize: Math.pow(10, -Number(s.quantityPrecision)),
    // Floor at 1 USDT even if the venue reports lower, for sane order sizes.
    minNotional: Math.max(1, Number(s.minTradeUSDT ?? 1)),
  };
}
