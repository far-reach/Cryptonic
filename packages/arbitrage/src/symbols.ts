/** Quote currencies we split concatenated symbols ("SOLUSDT") on, longest first. */
export const KNOWN_QUOTES = ["FDUSD", "USDT", "USDC", "USDE", "TUSD", "USD1", "BTC", "ETH", "EUR", "BRL", "TRY", "USD"] as const;

/** Split "SOLUSDT" into { base: "SOL", quote: "USDT" }; null when no known quote matches. */
export function splitSymbol(symbol: string): { base: string; quote: string } | null {
  const s = symbol.toUpperCase();
  for (const q of KNOWN_QUOTES) {
    if (s.length > q.length && s.endsWith(q)) return { base: s.slice(0, -q.length), quote: q };
  }
  return null;
}

/** Split "BTC-USDT" / "BTC_USDT" / "BTC/USDT". */
export function splitDelimited(symbol: string): { base: string; quote: string } | null {
  const m = symbol.toUpperCase().match(/^([A-Z0-9]+)[-_/]([A-Z0-9]+)(?:[-_/].*)?$/);
  return m ? { base: m[1], quote: m[2] } : null;
}

export const pairKey = (base: string, quote: string): string => `${base}/${quote}`;
