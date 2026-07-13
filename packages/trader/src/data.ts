import { readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "./types.js";

/** Fetch klines from the public (unsigned) Binance endpoint. */
export async function fetchKlines(
  baseUrl: string,
  symbol: string,
  interval: string,
  limit: number,
): Promise<Kline[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`klines fetch failed: ${res.status}`);
  const raw = (await res.json()) as (string | number)[][];
  return raw.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
  }));
}

/** CSV: openTime,open,high,low,close,volume,closeTime (header optional). */
export function loadKlinesCsv(path: string): Kline[] {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const out: Kline[] = [];
  for (const line of lines) {
    const cols = line.split(",");
    if (isNaN(Number(cols[0]))) continue; // header
    out.push({
      openTime: Number(cols[0]),
      open: Number(cols[1]),
      high: Number(cols[2]),
      low: Number(cols[3]),
      close: Number(cols[4]),
      volume: Number(cols[5] ?? 0),
      closeTime: Number(cols[6] ?? Number(cols[0]) + 3_599_999),
    });
  }
  return out;
}

export function saveKlinesCsv(path: string, klines: Kline[]): void {
  const header = "openTime,open,high,low,close,volume,closeTime";
  const rows = klines.map(
    (k) => `${k.openTime},${k.open},${k.high},${k.low},${k.close},${k.volume},${k.closeTime}`,
  );
  writeFileSync(path, [header, ...rows].join("\n") + "\n");
}

/** Deterministic PRNG so synthetic backtests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic hourly klines: mean-reverting (Ornstein-Uhlenbeck-flavored)
 * random walk around `anchor`, for offline testing of range strategies.
 * `drift` per candle lets tests model trends (e.g. -0.0005 = grinding bear).
 */
export function syntheticKlines(opts: {
  seed: number;
  candles: number;
  anchor: number;
  /** Per-candle volatility as a fraction, e.g. 0.004 = 0.4%. */
  vol: number;
  /** Pull-back strength toward the anchor, 0..1 (0 = pure random walk). */
  meanReversion?: number;
  drift?: number;
  startTime?: number;
}): Kline[] {
  const { seed, candles, anchor, vol } = opts;
  const meanReversion = opts.meanReversion ?? 0.02;
  const drift = opts.drift ?? 0;
  const startTime = opts.startTime ?? 1_750_000_000_000;
  const rand = mulberry32(seed);
  const gauss = () => {
    // Box-Muller
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out: Kline[] = [];
  let price = anchor;
  for (let i = 0; i < candles; i++) {
    const open = price;
    const shock = gauss() * vol;
    const pull = meanReversion * (anchor / price - 1);
    const close = price * (1 + shock + pull + drift);
    const wick = Math.abs(gauss()) * vol * 0.7;
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const openTime = startTime + i * 3_600_000;
    out.push({
      openTime,
      open,
      high,
      low,
      close,
      volume: 100 + rand() * 50,
      closeTime: openTime + 3_599_999,
    });
    price = close;
  }
  return out;
}

/** Auto-range for the grid: recent low/high with a small margin. */
export function autoRange(klines: Kline[], marginFraction = 0.02): { lower: number; upper: number } {
  if (klines.length === 0) throw new Error("no klines for auto-range");
  let lo = Infinity;
  let hi = 0;
  for (const k of klines) {
    lo = Math.min(lo, k.low);
    hi = Math.max(hi, k.high);
  }
  return { lower: lo * (1 - marginFraction), upper: hi * (1 + marginFraction) };
}
