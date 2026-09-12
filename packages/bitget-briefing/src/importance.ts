import type { ClassifiedAnnouncement } from "./types.js";

/**
 * Trade-impact importance scoring, 1–5 stars. The stated cause matters as much
 * as the headline: a suspension "due to wallet maintenance" is routine (★2),
 * while the same headline with no stated reason is a yellow flag (★3) —
 * unexplained freezes are sometimes the first public sign of an incident.
 */
export interface Importance {
  stars: 1 | 2 | 3 | 4 | 5;
  /** Two-or-three-word tag shown next to the stars. */
  label: string;
}

export function scoreAnnouncement(a: ClassifiedAnnouncement): Importance {
  const t = a.title.toLowerCase();
  const cause = a.reason?.cause;
  const excerpt = a.reason?.excerpt?.toLowerCase() ?? "";

  if (/delist/.test(t)) return { stars: 5, label: "forced-seller event" };
  if (cause === "security" || /securit|exploit|hack|breach|compromis/.test(t)) {
    return { stars: 5, label: "security event" };
  }
  if (/\bst\b|risk (warning|alert)|special treatment/.test(t)) {
    return { stars: 4, label: "delisting risk" };
  }
  if (cause === "migration" || /token (swap|migration|merge|split)|redenominat/.test(t)) {
    return { stars: 4, label: "token migration" };
  }
  if (/resum/.test(t)) return { stars: 1, label: "recovery" };
  // Scheduled maintenance of a spot pair/system: announced, routine, low impact.
  if (/^(bitget announcement on )?maintenance of\b|scheduled maintenance/.test(t)) {
    return { stars: 2, label: "scheduled maintenance" };
  }
  if (/suspend|halt|paus/.test(t)) {
    if (cause === "maintenance" || /wallet maintenance|scheduled/.test(excerpt)) {
      return { stars: 2, label: "routine maintenance" };
    }
    if (cause === "network-upgrade") return { stars: 2, label: "planned upgrade" };
    if (cause === "congestion") return { stars: 3, label: "network trouble" };
    return { stars: 3, label: "unexplained suspension" };
  }
  if (/funding rate|leverage|margin tier|position limit|tick size/.test(t)) {
    return { stars: 3, label: "affects positions" };
  }
  if (/will list|listing|lists |listed/.test(t)) return { stars: 3, label: "listing event" };
  if (/margin trading pair|margin pair/.test(t)) return { stars: 2, label: "leverage expansion" };
  if (/launchpool|launchpad|pre-?market|candybomb|poolx/.test(t)) return { stars: 2, label: "launch event" };
  if (/\bapi\b|websocket|endpoint/.test(t)) return { stars: 2, label: "integration change" };
  if (a.severity === "critical") return { stars: 3, label: "needs review" };
  if (a.severity === "notable") return { stars: 2, label: "notable" };
  return { stars: 1, label: "minor" };
}

/** "★★★★☆" */
export function starBar(stars: number): string {
  const n = Math.max(1, Math.min(5, Math.round(stars)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** Colored dot matching the importance tier — the fast visual index. */
export function tierDot(stars: number): string {
  if (stars >= 5) return "🔴";
  if (stars >= 4) return "🟠";
  if (stars >= 3) return "🟡";
  if (stars >= 2) return "🟢";
  return "⚪";
}

export interface EnvironmentGauge {
  emoji: string;
  text: string;
}

/** One-line temperature reading of the whole Bitget environment today. */
export function environmentGauge(anns: ClassifiedAnnouncement[]): EnvironmentGauge {
  const scores = anns.map(scoreAnnouncement);
  const max = Math.max(0, ...scores.map((s) => s.stars));
  const high = scores.filter((s) => s.stars >= 4).length;
  if (max >= 5) return { emoji: "🔴", text: "Turbulent — high-impact events in play" };
  if (high > 0) return { emoji: "🟠", text: "Active — elevated-risk events today" };
  if (max >= 3) return { emoji: "🟡", text: "Normal — tradeable activity, nothing alarming" };
  if (anns.length > 0) return { emoji: "🟢", text: "Calm — routine operations only" };
  return { emoji: "🟢", text: "Quiet — no significant announcements" };
}
