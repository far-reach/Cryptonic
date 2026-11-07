import type { ClassifiedAnnouncement } from "./types.js";
import { extractAsset } from "./signals.js";

/** Strip boilerplate lead-ins so the subject stands on its own. */
export function condenseTitle(title: string): string {
  const t = title
    .replace(/^bitget announcement (on|regarding)\s+/i, "")
    .replace(/^announcement (on|of|regarding)\s+(the\s+)?/i, "")
    .replace(/^notice (on|of|regarding)\s+(the\s+)?/i, "")
    .replace(/^bitget (to|will)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function services(t: string): string {
  const dep = /deposit/i.test(t);
  const wd = /withdraw/i.test(t);
  if (dep && wd) return "deposits & withdrawals";
  if (wd) return "withdrawals";
  if (dep) return "deposits";
  return "transfers";
}

/**
 * Rewrite a Bitget headline in plain trader language, e.g.
 * "Bitget announcement on suspending KLV - Klever deposit and withdrawal
 * services" → "KLV (Klever) — deposits & withdrawals paused".
 * Falls back to the condensed original when the pattern is unfamiliar.
 */
export function humanTitle(a: ClassifiedAnnouncement): string {
  const t = a.title;
  const asset = extractAsset(t);
  if (asset) {
    if (/delist/i.test(t)) return `${asset} — being delisted`;
    if (/resum|has (now )?(re)?opened/i.test(t)) return `${asset} — ${services(t)} back online`;
    if (/suspend|halt|paus/i.test(t)) return `${asset} — ${services(t)} paused`;
    if (/leverage|margin tier|maintenance margin|position (tier|limit)/i.test(t)) {
      return `${asset} — leverage & margin rules changed`;
    }
    if (/funding rate/i.test(t)) return `${asset} — funding rate rules changed`;
    if (/margin trading pair/i.test(t)) return `${asset} — margin trading added`;
    if (/will list|listing|lists |listed/i.test(t)) return `${asset} — new listing`;
  }
  return condenseTitle(t);
}

/**
 * A plain-language "why" for the item — built from the classified cause rather
 * than quoting announcement prose; quotes the article only when the cause is
 * unknown and the excerpt actually carries information.
 */
export function humanWhy(a: ClassifiedAnnouncement): string | null {
  const t = a.title;
  if (/leverage|margin|funding rate|position (tier|limit)|tick size/i.test(t) && /adjust|chang/i.test(t)) {
    return "Bitget is tightening this contract's risk limits — usually a response to volatility or thin liquidity.";
  }
  switch (a.reason?.cause) {
    case "maintenance":
      return "Routine scheduled wallet maintenance — nothing unusual.";
    case "network-upgrade":
      return "Planned upgrade on the asset's blockchain; transfers return once it completes.";
    case "security":
      return "A security issue — Bitget froze transfers to protect funds.";
    case "congestion":
      return "The asset's blockchain is unstable or congested right now.";
    case "migration":
      return "Token contract migration — old tokens are being exchanged for new ones.";
  }
  const excerpt = a.reason?.excerpt ?? "";
  if (excerpt.length >= 50) {
    // Avoid "Bitget says: “Bitget has…”" — quote alone when the subject repeats.
    return /^bitget\b/i.test(excerpt) ? `“${excerpt}”` : `Bitget says: “${excerpt}”`;
  }
  return null;
}
