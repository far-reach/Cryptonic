import type { FetchLike } from "./types.js";

const DEFAULT_API_BASE = "https://api.bitget.com";

/**
 * Fetch last prices for all Bitget spot tickers in one call.
 * Returns a map of symbol ("KLVUSDT") → last price. Best-effort: any failure
 * returns an empty map so signals simply render without price levels.
 */
export async function fetchSpotPrices(
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  apiBase = DEFAULT_API_BASE,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const res = await fetchFn(`${apiBase}/api/v2/spot/market/tickers`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return out;
    const json = JSON.parse(await res.text()) as {
      code?: string;
      data?: Array<{ symbol?: string; lastPr?: string }>;
    };
    if (json.code !== "00000" || !Array.isArray(json.data)) return out;
    for (const t of json.data) {
      const price = Number(t.lastPr);
      if (t.symbol && Number.isFinite(price) && price > 0) out.set(t.symbol.toUpperCase(), price);
    }
  } catch {
    // network unavailable — levels are optional
  }
  return out;
}
