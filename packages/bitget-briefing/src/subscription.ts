/**
 * Entitlement resolution and feature gating for the freemium model.
 *
 * Design rules (docs/pricing.md):
 *  - Licensing never breaks the product. Any license problem resolves to the
 *    free tier with a one-line stderr notice — the briefing itself always runs.
 *  - Safety is never gated. Nothing in here can drop a critical announcement;
 *    gates only touch paid depth (price brackets, weekly review, trend chart,
 *    extra channels, long windows).
 *  - The upsell is one calm footer line on the free tier's markdown, and it can
 *    be switched off. No nagging inside chat notifications.
 */
import type { NotifyEnv } from "./notify.js";
import type { LicenseStatus } from "./license.js";
import { LICENSE_GRACE_DAYS, verifyLicenseKey } from "./license.js";
import type { FeatureKey, Plan } from "./plans.js";
import { FREE_MAX_WINDOW_HOURS, PLANS, priceTag } from "./plans.js";

export interface SubscriptionEnv extends NotifyEnv {
  /** License key from checkout (`veil1.…`). Unset = free plan. */
  BRIEFING_LICENSE_KEY?: string;
  /** Optional trust-root override (SPKI base64) for self-issued deployments. */
  BRIEFING_LICENSE_PUBLIC_KEY?: string;
  /** Set to anything truthy to drop the free tier's footer line. */
  BRIEFING_NO_UPSELL?: string;
}

export interface Subscription {
  plan: Plan;
  /** Null when no license key was supplied. */
  license: LicenseStatus | null;
  /** Human-readable plan events (expiry, clamps, skipped channels) for stderr. */
  notices: string[];
}

/** Resolve the active plan from the environment. Never throws, never blocks. */
export function resolveSubscription(
  env: SubscriptionEnv = process.env as SubscriptionEnv,
  opts: { now?: number } = {},
): Subscription {
  const key = env.BRIEFING_LICENSE_KEY?.trim();
  if (!key) return { plan: PLANS.free, license: null, notices: [] };

  const license = verifyLicenseKey(key, {
    publicKey: env.BRIEFING_LICENSE_PUBLIC_KEY?.trim() || undefined,
    now: opts.now,
  });
  switch (license.state) {
    case "valid":
      return { plan: PLANS[license.claims.plan], license, notices: [] };
    case "grace":
      return {
        plan: PLANS[license.claims.plan],
        license,
        notices: [
          `license expired ${license.daysPastExpiry} day(s) ago — ` +
            `${PLANS[license.claims.plan].name} stays on for the ${LICENSE_GRACE_DAYS}-day grace window; renew to keep it`,
        ],
      };
    case "expired":
      return {
        plan: PLANS.free,
        license,
        notices: ["license expired — back on the free plan (the full daily briefing keeps working)"],
      };
    case "invalid":
      return {
        plan: PLANS.free,
        license,
        notices: [`license key rejected (${license.reason}) — running on the free plan`],
      };
  }
}

export function can(sub: Subscription, feature: FeatureKey): boolean {
  return sub.plan.features.includes(feature);
}

/** Cap the look-back window on the free tier (weekly's 168h is gated separately). */
export function clampWindowHours(
  sub: Subscription,
  requested: number,
): { hours: number; notice?: string } {
  if (requested <= FREE_MAX_WINDOW_HOURS || can(sub, "extended-window")) {
    return { hours: requested };
  }
  return {
    hours: FREE_MAX_WINDOW_HOURS,
    notice:
      `look-back window capped at ${FREE_MAX_WINDOW_HOURS}h on the free plan ` +
      `(requested ${requested}h — Pro removes the cap)`,
  };
}

const CHANNELS = [
  { label: "Telegram", keys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const },
  { label: "Slack", keys: ["SLACK_WEBHOOK_URL"] as const },
  { label: "Discord", keys: ["DISCORD_WEBHOOK_URL"] as const },
];

/**
 * On the free tier keep the first configured channel (Telegram → Slack →
 * Discord) and skip the rest; paid plans deliver everywhere at once.
 */
export function selectChannels(
  sub: Subscription,
  env: SubscriptionEnv,
): { env: NotifyEnv; notice?: string } {
  const configured = CHANNELS.filter((c) => env[c.keys[0]]);
  if (can(sub, "multi-channel") || configured.length <= 1) {
    const out: NotifyEnv = {};
    for (const c of CHANNELS) for (const k of c.keys) if (env[k]) out[k] = env[k];
    return { env: out };
  }
  const [kept, ...skipped] = configured;
  const out: NotifyEnv = {};
  for (const k of kept.keys) if (env[k]) out[k] = env[k];
  return {
    env: out,
    notice:
      `free plan delivers to one channel — using ${kept.label}, skipping ` +
      `${skipped.map((c) => c.label).join(" + ")} (Pro delivers to all at once)`,
  };
}

/**
 * The free tier's single upsell: one footer line on the markdown briefing.
 * Never rendered for paid plans, never injected into chat messages, and
 * removable with BRIEFING_NO_UPSELL=1.
 */
export function upsellFooter(sub: Subscription, env: SubscriptionEnv = {}): string {
  if (sub.plan.id !== "free" || env.BRIEFING_NO_UPSELL) return "";
  const pro = PLANS.pro;
  return (
    "\n---\n" +
    `_You're on the free plan — the complete daily briefing, free forever. ` +
    `**${pro.name}** (${priceTag(pro)}) adds price-bracketed trade angles, the weekly review, ` +
    `the 7-day trend chart & every delivery channel at once — see ` +
    `[pricing](https://github.com/far-reach/cryptonic/blob/main/packages/bitget-briefing/docs/pricing.md), ` +
    `activate with \`BRIEFING_LICENSE_KEY\` (hide this line: \`BRIEFING_NO_UPSELL=1\`)._\n`
  );
}

/** Multi-line status for the `--plan` flag. */
export function formatPlanStatus(sub: Subscription): string {
  const lines: string[] = [`Plan: ${sub.plan.name} — ${sub.plan.tagline}`];
  if (sub.license) {
    const l = sub.license;
    lines.push(
      l.state === "invalid"
        ? `License: invalid (${l.reason})`
        : `License: ${l.state}` +
            (l.claims.email ? ` · ${l.claims.email}` : "") +
            ` · expires ${new Date(l.claims.expiresAt).toISOString().slice(0, 10)}`,
    );
  }
  lines.push("", "Included:");
  for (const item of sub.plan.included) lines.push(`  • ${item}`);
  for (const notice of sub.notices) lines.push("", `Note: ${notice}`);
  if (sub.plan.id !== "desk") {
    const next = sub.plan.id === "free" ? PLANS.pro : PLANS.desk;
    lines.push(
      "",
      `Upgrade — ${next.name} (${priceTag(next)}): ${next.tagline}`,
      "  See packages/bitget-briefing/docs/pricing.md",
    );
  }
  return lines.join("\n");
}
