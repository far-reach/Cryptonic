import { createHmac } from "node:crypto";
import type { Balances, Exchange, Order, OrderRequest, SymbolRules } from "./types.js";
import type { TraderConfig } from "./config.js";

/**
 * Minimal signed REST client for Binance spot, implementing the same
 * `Exchange` interface as the paper simulator. Dependency-free (native
 * fetch + node:crypto HMAC-SHA256).
 *
 * Key-safety expectations (see README): the API key must have "Enable Spot
 * Trading" only — withdrawals disabled — and ideally an IP allowlist.
 * Secrets are read from environment variables, never from config files.
 */
export class BinanceExchange implements Exchange {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly recvWindow: number;
  private readonly symbol: string;
  private readonly baseAsset: string;
  private readonly quoteAsset: string;
  /** clientId -> orderId of orders we placed and still consider open. */
  private tracked = new Map<string, string>();

  private constructor(cfg: TraderConfig, readonly rules: SymbolRules) {
    this.baseUrl = cfg.binance.baseUrl.replace(/\/$/, "");
    this.symbol = cfg.symbol;
    this.baseAsset = cfg.baseAsset;
    this.quoteAsset = cfg.quoteAsset;
    this.recvWindow = cfg.binance.recvWindowMs;
    const key = process.env[cfg.binance.apiKeyEnv];
    const secret = process.env[cfg.binance.apiSecretEnv];
    if (!key || !secret)
      throw new Error(
        `missing API credentials: set ${cfg.binance.apiKeyEnv} and ${cfg.binance.apiSecretEnv}`,
      );
    this.apiKey = key;
    this.apiSecret = secret;
  }

  /** Connects and loads the symbol's trading rules from /exchangeInfo. */
  static async connect(cfg: TraderConfig): Promise<BinanceExchange> {
    const rules = await fetchSymbolRules(cfg.binance.baseUrl, cfg.symbol);
    return new BinanceExchange(cfg, rules);
  }

  // ---- Exchange interface -------------------------------------------------

  async lastPrice(): Promise<number> {
    const res = await this.request("GET", "/api/v3/ticker/price", { symbol: this.symbol }, false);
    return Number(res.price);
  }

  async balances(): Promise<Balances> {
    const res = await this.request("GET", "/api/v3/account", {}, true);
    const find = (asset: string, field: "free" | "locked") =>
      Number(
        res.balances?.find((b: { asset: string }) => b.asset === asset)?.[field] ?? 0,
      );
    return {
      quote: find(this.quoteAsset, "free"),
      base: find(this.baseAsset, "free"),
      lockedQuote: find(this.quoteAsset, "locked"),
      lockedBase: find(this.baseAsset, "locked"),
    };
  }

  async openOrders(): Promise<Order[]> {
    const res = await this.request("GET", "/api/v3/openOrders", { symbol: this.symbol }, true);
    return (res as RawOrder[]).map((o) => this.toOrder(o));
  }

  /**
   * Binance has no "what filled since last time" REST endpoint, so we track
   * the orders we placed and individually query any that left the open set.
   */
  async drainFills(): Promise<Order[]> {
    if (this.tracked.size === 0) return [];
    const open = new Set((await this.openOrders()).map((o) => o.orderId));
    const out: Order[] = [];
    for (const [clientId, orderId] of [...this.tracked]) {
      if (open.has(orderId)) continue;
      const res = await this.request(
        "GET",
        "/api/v3/order",
        { symbol: this.symbol, orderId },
        true,
      );
      const order = this.toOrder(res as RawOrder);
      this.tracked.delete(clientId);
      if (order.status === "FILLED" || order.status === "CANCELED") out.push(order);
    }
    return out;
  }

  async placeLimit(req: OrderRequest): Promise<Order> {
    const res = await this.request(
      "POST",
      "/api/v3/order",
      {
        symbol: req.symbol,
        side: req.side,
        type: "LIMIT",
        timeInForce: "GTC",
        price: String(req.price),
        quantity: String(req.qty),
        newClientOrderId: req.clientId,
        newOrderRespType: "RESULT",
      },
      true,
    );
    const order = this.toOrder(res as RawOrder);
    this.tracked.set(order.clientId, order.orderId);
    return order;
  }

  /**
   * Re-arm fill tracking after a restart for an order we placed in a
   * previous run. Terminal orders get picked up by the next drainFills().
   */
  async trackByClientId(clientId: string): Promise<void> {
    try {
      const res = await this.request(
        "GET",
        "/api/v3/order",
        { symbol: this.symbol, origClientOrderId: clientId },
        true,
      );
      const order = this.toOrder(res as RawOrder);
      this.tracked.set(order.clientId, order.orderId);
    } catch {
      // Order unknown to the exchange (e.g. never placed) — nothing to track.
    }
  }

  async cancel(orderId: string): Promise<void> {
    await this.request("DELETE", "/api/v3/order", { symbol: this.symbol, orderId }, true);
  }

  async cancelAll(): Promise<void> {
    const open = await this.openOrders();
    // Only cancel orders this bot placed (grid-* client ids) — never touch
    // the user's own manual orders on the same pair.
    for (const o of open) {
      if (o.clientId.startsWith("grid-")) await this.cancel(o.orderId);
    }
  }

  async marketSell(qty: number): Promise<Order> {
    const res = await this.request(
      "POST",
      "/api/v3/order",
      {
        symbol: this.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: String(qty),
        newClientOrderId: `grid-stop-${Date.now()}`,
        newOrderRespType: "RESULT",
      },
      true,
    );
    return this.toOrder(res as RawOrder);
  }

  // ---- plumbing -----------------------------------------------------------

  private toOrder(o: RawOrder): Order {
    const executedQty = Number(o.executedQty ?? 0);
    const executedQuote = Number(o.cummulativeQuoteQty ?? 0);
    const status: Order["status"] =
      o.status === "FILLED" ? "FILLED" : o.status === "NEW" || o.status === "PARTIALLY_FILLED" ? "NEW" : "CANCELED";
    return {
      symbol: o.symbol,
      side: o.side as Order["side"],
      price: Number(o.price),
      qty: Number(o.origQty),
      clientId: o.clientOrderId ?? "",
      orderId: String(o.orderId),
      status,
      executedQty,
      executedQuote,
      // REST order responses don't carry fees; approximate with the standard
      // spot fee so PnL accounting stays conservative.
      feeQuote: executedQuote * 0.001,
      createdAt: Number(o.time ?? o.transactTime ?? 0),
      updatedAt: Number(o.updateTime ?? o.transactTime ?? 0),
    };
  }

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Record<string, string | number>,
    signed: boolean,
  ): Promise<any> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) search.set(k, String(v));
    if (signed) {
      search.set("timestamp", String(Date.now()));
      search.set("recvWindow", String(this.recvWindow));
      search.set(
        "signature",
        createHmac("sha256", this.apiSecret).update(search.toString()).digest("hex"),
      );
    }
    const url = `${this.baseUrl}${path}?${search.toString()}`;
    const res = await fetch(url, {
      method,
      headers: signed || path.includes("openOrders") ? { "X-MBX-APIKEY": this.apiKey } : {},
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Binance ${method} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }
}

interface RawOrder {
  symbol: string;
  orderId: number | string;
  clientOrderId?: string;
  price: string;
  origQty: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  status: string;
  side: string;
  time?: number;
  transactTime?: number;
  updateTime?: number;
}

/** Public (unsigned) call to load tick/step/notional rules for a symbol. */
export async function fetchSymbolRules(baseUrl: string, symbol: string): Promise<SymbolRules> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v3/exchangeInfo?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`exchangeInfo failed: ${res.status}`);
  const info = (await res.json()) as {
    symbols: { symbol: string; filters: { filterType: string; [k: string]: string }[] }[];
  };
  const sym = info.symbols?.find((s) => s.symbol === symbol);
  if (!sym) throw new Error(`symbol ${symbol} not found on ${baseUrl}`);
  const filter = (type: string) => sym.filters.find((f) => f.filterType === type);
  return {
    tickSize: Number(filter("PRICE_FILTER")?.tickSize ?? 0.01),
    stepSize: Number(filter("LOT_SIZE")?.stepSize ?? 0.00001),
    minNotional: Number(filter("NOTIONAL")?.minNotional ?? filter("MIN_NOTIONAL")?.minNotional ?? 5),
  };
}
