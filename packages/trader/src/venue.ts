import type { Exchange, Kline, SymbolRules } from "./types.js";
import type { TraderConfig } from "./config.js";
import { fetchKlines } from "./data.js";
import { BinanceExchange, fetchSymbolRules } from "./binance.js";
import { BitgetExchange, fetchBitgetKlines, fetchBitgetPrice, fetchBitgetRules } from "./bitget.js";

/**
 * Venue dispatch: one place that knows which exchange the config selects.
 * Market data always comes from a REAL market (Binance's public data mirror
 * or Bitget production public endpoints) — never from a testnet.
 */

export function marketKlines(cfg: TraderConfig, interval: string, limit: number): Promise<Kline[]> {
  return cfg.exchange === "bitget"
    ? fetchBitgetKlines(cfg.bitget.baseUrl, cfg.symbol, interval, limit)
    : fetchKlines(cfg.binance.dataUrl, cfg.symbol, interval, limit);
}

export async function marketPrice(cfg: TraderConfig): Promise<number> {
  if (cfg.exchange === "bitget") return fetchBitgetPrice(cfg.bitget.baseUrl, cfg.symbol);
  const res = await fetch(
    `${cfg.binance.dataUrl.replace(/\/$/, "")}/api/v3/ticker/price?symbol=${cfg.symbol}`,
  );
  if (!res.ok) throw new Error(`ticker failed: ${res.status}`);
  return Number(((await res.json()) as { price: string }).price);
}

export function marketRules(cfg: TraderConfig): Promise<SymbolRules> {
  return cfg.exchange === "bitget"
    ? fetchBitgetRules(cfg.bitget.baseUrl, cfg.symbol)
    : fetchSymbolRules(cfg.binance.dataUrl, cfg.symbol);
}

export function connectLive(cfg: TraderConfig): Promise<Exchange & { trackByClientId(id: string): Promise<void> }> {
  return cfg.exchange === "bitget" ? BitgetExchange.connect(cfg) : BinanceExchange.connect(cfg);
}

/** True when `live` mode would place orders with real money on this config. */
export function isRealMoney(cfg: TraderConfig): boolean {
  if (cfg.exchange === "bitget") return true; // Bitget has no spot testnet
  return cfg.binance.baseUrl === "https://api.binance.com";
}
