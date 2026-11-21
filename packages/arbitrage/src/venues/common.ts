import type { FetchLike } from "../types.js";

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json",
};

export const defaultFetch = (): FetchLike => fetch as unknown as FetchLike;

/** GET a JSON document; throws with the venue name on HTTP or parse failure. */
export async function getJson(fetchFn: FetchLike, url: string, label: string): Promise<unknown> {
  const res = await fetchFn(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label}: non-JSON response from ${url}`);
  }
}

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

export const num0 = (v: unknown): number => {
  const n = num(v);
  return Number.isFinite(n) ? n : 0;
};
