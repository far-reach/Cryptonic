import type { FetchLike } from "../../types.js";
import type { SignedRequest } from "../types.js";

export const defaultFetch = (): FetchLike => fetch as unknown as FetchLike;

export async function send(fetchFn: FetchLike, req: SignedRequest, label: string): Promise<unknown> {
  const res = await fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
