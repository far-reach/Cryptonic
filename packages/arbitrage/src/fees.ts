import type { FeeTable, Venue, WithdrawalCost, WithdrawalTable } from "./types.js";

/**
 * Base-tier taker/maker fees (bps). Public fee pages, autumn 2026; most venues
 * discount these with volume tiers or native-token payment. Override via
 * ARB_FEES_JSON or the `fees` option when your account is on a better tier.
 */
export const DEFAULT_FEES: FeeTable = {
  bitget: { spotTakerBps: 10, spotMakerBps: 10, perpTakerBps: 6, perpMakerBps: 2 },
  binance: { spotTakerBps: 10, spotMakerBps: 10, perpTakerBps: 5, perpMakerBps: 2 },
  bybit: { spotTakerBps: 10, spotMakerBps: 10, perpTakerBps: 5.5, perpMakerBps: 2 },
  okx: { spotTakerBps: 10, spotMakerBps: 8, perpTakerBps: 5, perpMakerBps: 2 },
};

/**
 * Rough withdrawal cost on the cheapest commonly-supported network. Flat fees
 * drift with gas, so treat these as placeholders: the scanner reads Bitget's
 * live table from /api/v2/spot/public/coins when it can, and the other venues
 * only expose theirs behind authenticated endpoints.
 */
export const DEFAULT_WITHDRAWALS: WithdrawalTable = {
  bitget: {
    BTC: { fee: 0.0002, minutes: 30 },
    ETH: { fee: 0.0008, minutes: 5 },
    SOL: { fee: 0.01, minutes: 2 },
    USDT: { fee: 1, minutes: 2 },
    USDC: { fee: 1, minutes: 2 },
  },
  binance: {
    BTC: { fee: 0.0002, minutes: 30 },
    ETH: { fee: 0.0008, minutes: 5 },
    SOL: { fee: 0.01, minutes: 2 },
    USDT: { fee: 1, minutes: 2 },
    USDC: { fee: 1, minutes: 2 },
  },
  bybit: {
    BTC: { fee: 0.0002, minutes: 30 },
    ETH: { fee: 0.0008, minutes: 5 },
    SOL: { fee: 0.01, minutes: 2 },
    USDT: { fee: 1, minutes: 2 },
    USDC: { fee: 1, minutes: 2 },
  },
  okx: {
    BTC: { fee: 0.0002, minutes: 30 },
    ETH: { fee: 0.0008, minutes: 5 },
    SOL: { fee: 0.01, minutes: 2 },
    USDT: { fee: 1, minutes: 2 },
    USDC: { fee: 1, minutes: 2 },
  },
};

export function feesFor(table: FeeTable, venue: Venue) {
  return table[venue] ?? DEFAULT_FEES[venue];
}

export function withdrawalFor(table: WithdrawalTable, venue: Venue, coin: string): WithdrawalCost | undefined {
  return table[venue]?.[coin.toUpperCase()];
}

/** Merge a partial override (e.g. parsed from ARB_FEES_JSON) over the defaults. */
export function mergeFees(override?: Partial<Record<Venue, Partial<FeeTable[Venue]>>>): FeeTable {
  const out = { ...DEFAULT_FEES };
  if (!override) return out;
  for (const v of Object.keys(override) as Venue[]) {
    if (!(v in out)) continue;
    out[v] = { ...out[v], ...override[v] };
  }
  return out;
}
