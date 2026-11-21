import type { BookLevel } from "./types.js";

export interface Fill {
  /** Volume-weighted average price of the fill. */
  avgPrice: number;
  filledBase: number;
  filledQuote: number;
  /** True when the book ran out before the requested amount was filled. */
  exhausted: boolean;
}

/** Buy `notionalQuote` worth of base by walking the asks (best-first). */
export function fillBuy(asks: readonly BookLevel[], notionalQuote: number): Fill {
  let remaining = notionalQuote;
  let base = 0;
  let quote = 0;
  for (const lvl of asks) {
    if (remaining <= 0) break;
    const levelQuote = lvl.price * lvl.size;
    const take = Math.min(levelQuote, remaining);
    base += take / lvl.price;
    quote += take;
    remaining -= take;
  }
  return { avgPrice: base > 0 ? quote / base : NaN, filledBase: base, filledQuote: quote, exhausted: remaining > 1e-12 };
}

/** Sell `amountBase` by walking the bids (best-first). */
export function fillSell(bids: readonly BookLevel[], amountBase: number): Fill {
  let remaining = amountBase;
  let base = 0;
  let quote = 0;
  for (const lvl of bids) {
    if (remaining <= 0) break;
    const take = Math.min(lvl.size, remaining);
    base += take;
    quote += take * lvl.price;
    remaining -= take;
  }
  return { avgPrice: base > 0 ? quote / base : NaN, filledBase: base, filledQuote: quote, exhausted: remaining > 1e-12 };
}

/** Total quote-currency notional resting on one side of the book. */
export function sideNotional(levels: readonly BookLevel[]): number {
  let n = 0;
  for (const l of levels) n += l.price * l.size;
  return n;
}

/** Parse `[[price, size], ...]` (strings or numbers) into sorted levels, dropping junk. */
export function parseLevels(raw: unknown, side: "bids" | "asks"): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const size = Number(row[1]);
    if (Number.isFinite(price) && Number.isFinite(size) && price > 0 && size > 0) out.push({ price, size });
  }
  out.sort((a, b) => (side === "asks" ? a.price - b.price : b.price - a.price));
  return out;
}
