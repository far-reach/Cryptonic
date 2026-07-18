import type { ClassifiedAnnouncement } from "./types.js";

/**
 * Rule-based trade angles derived from event-study literature on exchange
 * announcements (see docs/announcement-alpha.md for sources):
 *  - listings: ~6% listing-day abnormal return, ~9-10% around the event,
 *    fading after — chasing the pop is historically poor.
 *  - delistings: -20..-70% within days, forced-seller pressure into removal.
 *  - transfer suspensions: venue price decouples from the global market while
 *    arbitrage is blocked; the gap tends to close on resumption.
 *  - contract-parameter tightening: exchange de-risking flags an unusual
 *    volatility/liquidity regime.
 * These are pattern heuristics, not personalized financial advice.
 */
export interface TradeSignal {
  /** Extracted asset/pair, e.g. "USDC (APTOS)" or "BEAM/USDT"; undefined if unclear. */
  asset?: string;
  stance: "exit-risk" | "short-bias" | "arb-watch" | "vol-watch" | "avoid-chase";
  note: string;
  source: ClassifiedAnnouncement;
}

const STANCE_PRIORITY: Record<TradeSignal["stance"], number> = {
  "exit-risk": 0,
  "short-bias": 1,
  "arb-watch": 2,
  "vol-watch": 3,
  "avoid-chase": 4,
};

export const STANCE_GLYPH: Record<TradeSignal["stance"], string> = {
  "exit-risk": "⚠️",
  "short-bias": "📉",
  "arb-watch": "🔁",
  "vol-watch": "🌊",
  "avoid-chase": "⏳",
};

/** Pull a recognizable asset out of an announcement title. */
export function extractAsset(title: string): string | undefined {
  // "USDC - APTOS", "VANA - Vana", "HOME - BASE"
  const dash = title.match(/\b([A-Z0-9]{2,10})\s+-\s+([A-Za-z0-9]{2,20})\b/);
  if (dash) return `${dash[1]} (${dash[2]})`;
  // "NewCoin (NEW)"
  const paren = title.match(/\(([A-Z0-9]{2,10})\)/);
  if (paren) return paren[1];
  // "XYZ/USDT"
  const pair = title.match(/\b([A-Z0-9]{2,10}\/[A-Z]{3,5})\b/);
  if (pair) return pair[1];
  // "RAREUSDT" style perp symbols; take the first if listed
  const perp = title.match(/\b([A-Z0-9]{2,12})USDT\b/);
  if (perp) return `${perp[1]}USDT perp`;
  return undefined;
}

function signalFor(a: ClassifiedAnnouncement): TradeSignal | null {
  const t = a.title.toLowerCase();
  const asset = extractAsset(a.title);
  const mk = (stance: TradeSignal["stance"], note: string): TradeSignal => ({ asset, stance, note, source: a });

  if (/delist/.test(t)) {
    return mk(
      "exit-risk",
      "Delisted assets historically drop 20–70% into removal on forced selling; exit or avoid — post-capitulation bounces are usually traps.",
    );
  }
  if (/\bst\b|risk (warning|alert)|special treatment/.test(t)) {
    return mk("short-bias", "Risk tags often precede delisting; negative drift has historically followed.");
  }
  if (/resum/.test(t)) {
    return mk(
      "arb-watch",
      "Transfers reconnected: any Bitget premium/discount vs the global price tends to snap shut, and trapped holders can finally move coins — watch for a supply wave.",
    );
  }
  if (/suspend|halt|paus/.test(t) && /deposit|withdraw/.test(t)) {
    return mk(
      "arb-watch",
      "With transfers frozen, the Bitget price can decouple from other venues; note the gap — it historically closes on resumption.",
    );
  }
  if (/funding rate|leverage|margin tier|position limit|tick size/.test(t)) {
    return mk(
      "vol-watch",
      "Exchange de-risking this contract flags unusual volatility/liquidity; size down and expect funding swings.",
    );
  }
  if (/margin trading pair|margin pair/.test(t)) {
    return mk("vol-watch", "Fresh leverage availability tends to lift volume and volatility short-term.");
  }
  if (/launchpool|launchpad|pre-?market|candybomb|poolx/.test(t)) {
    return mk(
      "avoid-chase",
      "Farmed rewards are typically sold at claim; the better entry has historically been after the first unlock dump.",
    );
  }
  if (/will list|lists |listing|listed/.test(t)) {
    return mk(
      "avoid-chase",
      "Listings average ~6% pop on the day (~9–10% around the event) then fade; chasing late has been a losing pattern — wait for the retrace.",
    );
  }
  return null;
}

/** Derive up to `cap` prioritized trade angles from the day's announcements. */
export function deriveSignals(anns: ClassifiedAnnouncement[], cap = 4): TradeSignal[] {
  const seen = new Set<string>();
  const signals: TradeSignal[] = [];
  for (const a of anns) {
    const s = signalFor(a);
    if (!s) continue;
    const key = `${s.stance}:${s.asset ?? s.source.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push(s);
  }
  return signals.sort((x, y) => STANCE_PRIORITY[x.stance] - STANCE_PRIORITY[y.stance]).slice(0, cap);
}
