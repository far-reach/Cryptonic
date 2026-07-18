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
export interface PriceLevels {
  side: "long" | "short";
  entry: number;
  tp: number;
  sl: number;
  /** Percent moves from entry, e.g. { tp: -30, sl: 12 }. */
  pct: { tp: number; sl: number };
}

export interface TradeSignal {
  /** Extracted asset/pair, e.g. "USDC (APTOS)" or "BEAM/USDT"; undefined if unclear. */
  asset?: string;
  /** Base coin for price lookup ("KLV"); undefined when unknown or a stablecoin. */
  coin?: string;
  stance: "exit-risk" | "short-bias" | "arb-watch" | "vol-watch" | "avoid-chase";
  /** Present only for stances with a tradable direction (see attachPriceLevels). */
  levels?: PriceLevels;
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

const STABLECOINS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "PYUSD"]);

/** Base coin for price lookup; undefined for stablecoins (levels are meaningless). */
export function extractCoin(title: string): string | undefined {
  const dash = title.match(/\b([A-Z0-9]{2,10})\s+-\s+[A-Za-z0-9]{2,20}\b/);
  const paren = title.match(/\(([A-Z0-9]{2,10})\)/);
  const pair = title.match(/\b([A-Z0-9]{2,10})\/(?:USDT|USDC)\b/);
  const perp = title.match(/\b([A-Z0-9]{2,12})USDT\b/);
  const coin = dash?.[1] ?? paren?.[1] ?? pair?.[1] ?? perp?.[1];
  return coin && !STABLECOINS.has(coin) ? coin : undefined;
}

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
  const coin = extractCoin(a.title);
  const mk = (stance: TradeSignal["stance"], note: string): TradeSignal => ({ asset, coin, stance, note, source: a });

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

const round4 = (n: number) => Number(n.toPrecision(4));

/**
 * Research-anchored mechanical brackets, computed from the live last price:
 *  - exit-risk (delisting): short — TP at −30% (documented −20…−40% drift into
 *    removal), SL at +12% (above typical dead-cat bounces).
 *  - short-bias (risk tags): short — TP −15%, SL +8%.
 *  - arb-watch on RESUMPTION only: fade the reconnect-supply wave — short with
 *    TP −5%, SL +4%. Frozen-transfer watches get no levels (nothing tradable
 *    until transfers reopen).
 *  - avoid-chase (listings/launches): patience long — entry at the −15%
 *    retrace of the current price, TP back at today's price (+15% from entry),
 *    SL −10% below entry.
 *  - vol-watch: no levels — the signal is about sizing, not direction.
 * These are mechanical percentages, not price predictions.
 */
export function computeLevels(signal: TradeSignal, lastPrice: number): PriceLevels | undefined {
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return undefined;
  const short = (tpPct: number, slPct: number): PriceLevels => ({
    side: "short",
    entry: round4(lastPrice),
    tp: round4(lastPrice * (1 + tpPct / 100)),
    sl: round4(lastPrice * (1 + slPct / 100)),
    pct: { tp: tpPct, sl: slPct },
  });
  switch (signal.stance) {
    case "exit-risk":
      return short(-30, 12);
    case "short-bias":
      return short(-15, 8);
    case "arb-watch": {
      if (!/resum/i.test(signal.source.title)) return undefined;
      return short(-5, 4);
    }
    case "avoid-chase": {
      const entry = lastPrice * 0.85;
      return {
        side: "long",
        entry: round4(entry),
        tp: round4(lastPrice),
        sl: round4(entry * 0.9),
        pct: { tp: 15, sl: -10 },
      };
    }
    case "vol-watch":
      return undefined;
  }
}

/** Attach price levels to signals whose coin has a live USDT spot price. */
export function attachPriceLevels(
  signals: TradeSignal[],
  prices: Map<string, number>,
): TradeSignal[] {
  return signals.map((s) => {
    if (!s.coin) return s;
    const last = prices.get(`${s.coin}USDT`);
    if (last === undefined) return s;
    const levels = computeLevels(s, last);
    return levels ? { ...s, levels } : s;
  });
}

/** "Short @ 0.0432 · TP 0.0302 (−30%) · SL 0.0484 (+12%)" */
export function formatLevels(l: PriceLevels): string {
  const pct = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n)}%`;
  const side = l.side === "short" ? "Short" : "Long";
  return `${side} @ ${l.entry} · TP ${l.tp} (${pct(l.pct.tp)}) · SL ${l.sl} (${pct(l.pct.sl)})`;
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
