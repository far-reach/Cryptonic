import { createHmac } from "node:crypto";

export const hmacHex = (secret: string, message: string): string => createHmac("sha256", secret).update(message).digest("hex");
export const hmacBase64 = (secret: string, message: string): string => createHmac("sha256", secret).update(message).digest("base64");

/** Round a quantity DOWN to the venue's step (never send more than you have). */
export function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number((Math.floor(value / step + 1e-9) * step).toFixed(decimals));
}

/** Round a price to the tick: up for buys (so the limit still crosses), down for sells. */
export function roundPrice(price: number, tick: number, side: "buy" | "sell"): number {
  if (!(tick > 0)) return price;
  const decimals = Math.max(0, Math.ceil(-Math.log10(tick)));
  const units = side === "buy" ? Math.ceil(price / tick - 1e-9) : Math.floor(price / tick + 1e-9);
  return Number((units * tick).toFixed(decimals));
}

/** Decimal string without exponent or trailing zeros, as venues expect. */
export function numStr(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  let s = n.toFixed(12);
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

export const newClientOrderId = (prefix = "arb"): string => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
