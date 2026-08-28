/**
 * Freemium plan catalog.
 *
 * The model (from the 2026 extension-monetization research, see docs/pricing.md):
 * freemium subscription is the most durable model across sources — a genuinely
 * good free version, with the daily-reach-for features paid. Typical pricing is
 * $5–15/mo consumer and $15–49/mo for professional tools, with annual priced at
 * 8–10× monthly. A free tier that feels crippled drives uninstalls, not upgrades.
 *
 * Applied here:
 *  - Free is the complete daily briefing. Everything that protects your money
 *    (delistings, freezes, security notices) is free forever — safety is never
 *    the upsell.
 *  - Paid unlocks the daily-reach-for depth: price-bracketed trade angles, the
 *    weekly review, the 7-day trend chart, every delivery channel at once, and
 *    longer look-back windows.
 */

export type PlanId = "free" | "pro" | "desk";

/** Machine-checkable gates for paid functionality (see subscription.ts). */
export type FeatureKey =
  /** Live entry/TP/SL brackets attached to trade angles (free keeps the angles themselves). */
  | "price-levels"
  /** The Sunday weekly review (`--weekly`). */
  | "weekly-review"
  /** Deliver to Telegram + Slack + Discord simultaneously (free: one channel). */
  | "multi-channel"
  /** Look-back windows beyond FREE_MAX_WINDOW_HOURS. */
  | "extended-window"
  /** 7-day severity trend chart in the Telegram photo (free: today's counts). */
  | "trend-chart"
  /** License covers a team/shared desk (multiple people, commercial use). */
  | "team-seats";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** 0 for the free plan. */
  monthlyUsd: number;
  /** Annual price; for paid plans held at 8–10× monthly per the research. */
  annualUsd: number;
  /** Paid feature gates this plan unlocks. */
  features: readonly FeatureKey[];
  /** Human-readable inclusions, for --plan and the docs. */
  included: readonly string[];
}

/** The free tier accepts look-back windows up to this many hours. */
export const FREE_MAX_WINDOW_HOURS = 48;

const PRO_FEATURES: readonly FeatureKey[] = [
  "price-levels",
  "weekly-review",
  "multi-channel",
  "extended-window",
  "trend-chart",
];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "The complete daily briefing — free forever.",
    monthlyUsd: 0,
    annualUsd: 0,
    features: [],
    included: [
      "Full daily briefing: critical / notable / FYI with importance stars & environment gauge",
      "Every safety alert — delistings, freezes, maintenance, security — always free",
      "Plain-language \"why\" extracted from the announcement body",
      "Trade angles (stance + reasoning; price brackets are Pro)",
      "One delivery channel (Telegram, Slack, or Discord)",
      "--critical-only alert scheduling and --demo mode",
      `Look-back window up to ${FREE_MAX_WINDOW_HOURS}h`,
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "The daily-reach-for depth, for one trader.",
    monthlyUsd: 9,
    annualUsd: 79, // ≈ 8.8× monthly
    features: PRO_FEATURES,
    included: [
      "Everything in Free",
      "Trade angles with live entry / take-profit / stop-loss brackets",
      "Sunday weekly review (--weekly)",
      "7-day severity trend chart",
      "All delivery channels at once (Telegram + Slack + Discord)",
      "Custom look-back windows",
    ],
  },
  desk: {
    id: "desk",
    name: "Desk",
    tagline: "Pro for a whole trading desk.",
    monthlyUsd: 29,
    annualUsd: 249, // ≈ 8.6× monthly
    features: [...PRO_FEATURES, "team-seats"],
    included: [
      "Everything in Pro",
      "Team license: up to 5 people / shared team channels, commercial use",
      "Priority support",
    ],
  },
};

export const PAID_PLAN_IDS = ["pro", "desk"] as const satisfies readonly PlanId[];

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "pro" || v === "desk";
}

/** One-line price tag, e.g. "$9/mo · $79/yr". */
export function priceTag(plan: Plan): string {
  if (plan.monthlyUsd === 0) return "free";
  return `$${plan.monthlyUsd}/mo · $${plan.annualUsd}/yr`;
}
