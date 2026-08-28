import { describe, expect, it } from "vitest";
import {
  FREE_MAX_WINDOW_HOURS,
  LICENSE_GRACE_DAYS,
  PAID_PLAN_IDS,
  PLANS,
  can,
  clampWindowHours,
  formatPlanStatus,
  generateLicenseKeypair,
  issueLicenseKey,
  priceTag,
  resolveSubscription,
  selectChannels,
  upsellFooter,
  verifyLicenseKey,
  type LicenseClaims,
} from "../src/index.js";

const NOW = 1_800_000_000_000; // fixed "now" for deterministic tests
const DAY = 86_400_000;

const { publicKey, privateKey } = generateLicenseKeypair();

function key(over: Partial<LicenseClaims> = {}): string {
  return issueLicenseKey(
    { plan: "pro", email: "trader@example.com", issuedAt: NOW - DAY, expiresAt: NOW + 30 * DAY, ...over },
    privateKey,
  );
}

describe("plan catalog (grounded in the monetization research)", () => {
  it("prices annual at 8–10× monthly for every paid plan", () => {
    for (const id of PAID_PLAN_IDS) {
      const p = PLANS[id];
      const multiple = p.annualUsd / p.monthlyUsd;
      expect(multiple).toBeGreaterThanOrEqual(8);
      expect(multiple).toBeLessThanOrEqual(10);
    }
  });

  it("keeps Pro in the $5–15 consumer band and Desk in the $15–49 professional band", () => {
    expect(PLANS.pro.monthlyUsd).toBeGreaterThanOrEqual(5);
    expect(PLANS.pro.monthlyUsd).toBeLessThanOrEqual(15);
    expect(PLANS.desk.monthlyUsd).toBeGreaterThanOrEqual(15);
    expect(PLANS.desk.monthlyUsd).toBeLessThanOrEqual(49);
  });

  it("never gates safety: the free tier has no feature that touches critical alerts", () => {
    // The gates that exist are all depth/convenience — this list is the contract.
    expect([...PLANS.pro.features].sort()).toEqual([
      "extended-window",
      "multi-channel",
      "price-levels",
      "trend-chart",
      "weekly-review",
    ]);
    expect(PLANS.free.features).toEqual([]);
    expect(PLANS.free.included.join(" ")).toMatch(/always free/);
  });

  it("desk is a superset of pro", () => {
    for (const f of PLANS.pro.features) expect(PLANS.desk.features).toContain(f);
    expect(PLANS.desk.features).toContain("team-seats");
    expect(priceTag(PLANS.desk)).toBe("$29/mo · $249/yr");
    expect(priceTag(PLANS.free)).toBe("free");
  });
});

describe("license keys", () => {
  it("round-trips a valid key", () => {
    const status = verifyLicenseKey(key(), { publicKey, now: NOW });
    expect(status.state).toBe("valid");
    if (status.state !== "valid") return;
    expect(status.claims).toMatchObject({ plan: "pro", email: "trader@example.com" });
    expect(status.claims.expiresAt).toBe(NOW + 30 * DAY);
  });

  it("rejects tampered payloads and foreign signatures", () => {
    const k = key();
    const [prefix, payload, sig] = k.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), p: "desk" }),
    ).toString("base64url");
    expect(verifyLicenseKey(`${prefix}.${forged}.${sig}`, { publicKey, now: NOW }).state).toBe("invalid");
    // signed by someone else's key
    const other = generateLicenseKeypair();
    const foreign = issueLicenseKey(
      { plan: "pro", issuedAt: NOW, expiresAt: NOW + DAY },
      other.privateKey,
    );
    expect(verifyLicenseKey(foreign, { publicKey, now: NOW }).state).toBe("invalid");
  });

  it("never throws on garbage", () => {
    for (const junk of ["", "hello", "veil1.x", "veil1.!!.??", "veil2.a.b", "veil1.e30.e30"]) {
      expect(verifyLicenseKey(junk, { publicKey, now: NOW }).state).toBe("invalid");
    }
  });

  it("keeps a lapsed key alive through the grace window, then expires it", () => {
    const lapsed = key({ expiresAt: NOW - 2 * DAY });
    const grace = verifyLicenseKey(lapsed, { publicKey, now: NOW });
    expect(grace).toMatchObject({ state: "grace", daysPastExpiry: 2 });
    const dead = verifyLicenseKey(lapsed, { publicKey, now: NOW + LICENSE_GRACE_DAYS * DAY });
    expect(dead.state).toBe("expired");
  });
});

describe("subscription resolution", () => {
  it("defaults to free with no notices", () => {
    const sub = resolveSubscription({}, { now: NOW });
    expect(sub.plan.id).toBe("free");
    expect(sub.license).toBeNull();
    expect(sub.notices).toEqual([]);
  });

  it("activates the licensed plan", () => {
    const sub = resolveSubscription(
      { BRIEFING_LICENSE_KEY: key({ plan: "desk" }), BRIEFING_LICENSE_PUBLIC_KEY: publicKey },
      { now: NOW },
    );
    expect(sub.plan.id).toBe("desk");
    expect(sub.notices).toEqual([]);
    expect(can(sub, "team-seats")).toBe(true);
  });

  it("falls back to free — with a notice, never an error — on a bad or expired key", () => {
    const bad = resolveSubscription({ BRIEFING_LICENSE_KEY: "veil1.garbage.key" }, { now: NOW });
    expect(bad.plan.id).toBe("free");
    expect(bad.notices[0]).toMatch(/rejected .*free plan/);
    const expired = resolveSubscription(
      { BRIEFING_LICENSE_KEY: key({ expiresAt: NOW - 30 * DAY }), BRIEFING_LICENSE_PUBLIC_KEY: publicKey },
      { now: NOW },
    );
    expect(expired.plan.id).toBe("free");
    expect(expired.notices[0]).toMatch(/keeps working/);
  });

  it("warns but keeps entitlements during the grace window", () => {
    const sub = resolveSubscription(
      { BRIEFING_LICENSE_KEY: key({ expiresAt: NOW - DAY }), BRIEFING_LICENSE_PUBLIC_KEY: publicKey },
      { now: NOW },
    );
    expect(sub.plan.id).toBe("pro");
    expect(can(sub, "price-levels")).toBe(true);
    expect(sub.notices[0]).toMatch(/grace window/);
  });
});

describe("feature gates", () => {
  const free = resolveSubscription({}, { now: NOW });
  const pro = resolveSubscription(
    { BRIEFING_LICENSE_KEY: key(), BRIEFING_LICENSE_PUBLIC_KEY: publicKey },
    { now: NOW },
  );

  it("clamps long windows on free only", () => {
    expect(clampWindowHours(free, 24)).toEqual({ hours: 24 });
    expect(clampWindowHours(free, FREE_MAX_WINDOW_HOURS)).toEqual({ hours: FREE_MAX_WINDOW_HOURS });
    const clamped = clampWindowHours(free, 168);
    expect(clamped.hours).toBe(FREE_MAX_WINDOW_HOURS);
    expect(clamped.notice).toMatch(/capped at 48h/);
    expect(clampWindowHours(pro, 168)).toEqual({ hours: 168 });
  });

  it("limits free delivery to the first configured channel, in priority order", () => {
    const env = {
      TELEGRAM_BOT_TOKEN: "tok",
      TELEGRAM_CHAT_ID: "42",
      SLACK_WEBHOOK_URL: "https://slack",
      DISCORD_WEBHOOK_URL: "https://discord",
    };
    const picked = selectChannels(free, env);
    expect(picked.env).toEqual({ TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "42" });
    expect(picked.notice).toMatch(/using Telegram, skipping Slack \+ Discord/);
    // without telegram, slack wins
    const slackFirst = selectChannels(free, { SLACK_WEBHOOK_URL: "s", DISCORD_WEBHOOK_URL: "d" });
    expect(slackFirst.env).toEqual({ SLACK_WEBHOOK_URL: "s" });
    // a single configured channel needs no notice
    expect(selectChannels(free, { DISCORD_WEBHOOK_URL: "d" })).toEqual({
      env: { DISCORD_WEBHOOK_URL: "d" },
    });
    // pro keeps everything
    expect(selectChannels(pro, env).env).toEqual(env);
    expect(selectChannels(pro, env).notice).toBeUndefined();
  });

  it("shows one calm upsell line on free markdown only, and it can be silenced", () => {
    const footer = upsellFooter(free, {});
    expect(footer).toContain("$9/mo · $79/yr");
    expect(footer).toContain("free forever");
    expect(footer.trim().split("\n").length).toBeLessThanOrEqual(3); // rule + one paragraph
    expect(upsellFooter(free, { BRIEFING_NO_UPSELL: "1" })).toBe("");
    expect(upsellFooter(pro, {})).toBe("");
  });

  it("renders a --plan status with license state and an upgrade pointer", () => {
    const status = formatPlanStatus(pro);
    expect(status).toContain("Plan: Pro");
    expect(status).toContain("License: valid · trader@example.com");
    expect(status).toContain("Upgrade — Desk ($29/mo · $249/yr)");
    const freeStatus = formatPlanStatus(free);
    expect(freeStatus).toContain("Plan: Free");
    expect(freeStatus).toContain("free forever");
    expect(freeStatus).toContain("Upgrade — Pro ($9/mo · $79/yr)");
  });
});
