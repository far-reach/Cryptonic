/** Numeric helpers for exchange-rule rounding (tick/step sizes). */

/** Count decimals of a step like 0.00001 -> 5 (steps are powers of ten on Binance). */
function decimalsOf(step: number): number {
  const s = step.toString();
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Floor `value` to a multiple of `step`, avoiding float dust (0.30000000000000004). */
export function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const d = decimalsOf(step);
  return Number((Math.floor((value + 1e-12) / step) * step).toFixed(d));
}

/** Round `value` to a multiple of `step` (used for prices, where nearest is fine). */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const d = decimalsOf(step);
  return Number((Math.round(value / step) * step).toFixed(d));
}

/** Geometric grid levels: n prices from lower to upper with a constant ratio. */
export function gridLevels(lower: number, upper: number, n: number): number[] {
  if (n < 2 || lower <= 0 || upper <= lower) throw new Error("invalid grid range");
  const r = Math.pow(upper / lower, 1 / (n - 1));
  const levels: number[] = [];
  for (let i = 0; i < n; i++) levels.push(lower * Math.pow(r, i));
  return levels;
}

/** UTC day key like "2026-07-13" for daily loss accounting. */
export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
