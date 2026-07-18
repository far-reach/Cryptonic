import type { Briefing, ClassifiedAnnouncement } from "./types.js";

export interface BriefingOptions {
  /** Look-back window; announcements older than this are dropped. Default 24. */
  windowHours?: number;
  /** "Now" in ms — injectable for tests. Default Date.now(). */
  now?: number;
  fetchErrors?: string[];
}

/**
 * Filter classified announcements to the briefing window and bucket by severity.
 * Announcements with unknown timestamps are kept (better noisy than silent on a delisting).
 */
export function buildBriefing(
  anns: ClassifiedAnnouncement[],
  opts: BriefingOptions = {},
): Briefing {
  const now = opts.now ?? Date.now();
  const windowHours = opts.windowHours ?? 24;
  const cutoff = now - windowHours * 3_600_000;
  const inWindow = anns.filter((a) => a.publishedAt === null || a.publishedAt >= cutoff);
  const bySeverity = (s: ClassifiedAnnouncement["severity"]) =>
    inWindow
      .filter((a) => a.severity === s)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  return {
    generatedAt: now,
    windowHours,
    critical: bySeverity("critical"),
    notable: bySeverity("notable"),
    info: bySeverity("info"),
    fetchErrors: opts.fetchErrors ?? [],
  };
}

function fmtTime(ms: number | null): string {
  if (ms === null) return "time n/a";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function mdItem(a: ClassifiedAnnouncement): string {
  const link = a.url ? `[${a.title}](${a.url})` : a.title;
  const reasons = a.reasons.length ? ` · _${a.reasons.join(", ")}_` : "";
  return `- **${link}**\n  ${fmtTime(a.publishedAt)}${reasons}`;
}

/** Render the briefing as GitHub-flavoured markdown. */
export function renderMarkdown(b: Briefing): string {
  const date = new Date(b.generatedAt).toISOString().slice(0, 10);
  const lines: string[] = [
    `# Bitget daily briefing — ${date}`,
    "",
    `_Last ${b.windowHours}h of the [Bitget announcement center](https://www.bitget.com/asia/support/announcement-center)._`,
    "",
    `**TL;DR:** ${b.critical.length} critical · ${b.notable.length} notable · ${b.info.length} FYI`,
    "",
    "## 🔴 Critical — act or verify today",
    "",
    b.critical.length ? b.critical.map(mdItem).join("\n") : "_No critical announcements. 🎉_",
    "",
    "## 🟡 Notable — worth a look",
    "",
    b.notable.length ? b.notable.map(mdItem).join("\n") : "_Nothing notable._",
    "",
    "## 🟢 FYI — promos & misc",
    "",
    b.info.length ? b.info.map(mdItem).join("\n") : "_Nothing else._",
  ];
  if (b.fetchErrors.length) {
    lines.push("", "## ⚠️ Fetch warnings", "", ...b.fetchErrors.map((e) => `- ${e}`));
  }
  return lines.join("\n") + "\n";
}

/** Plain-text rendering for chat notifiers (Telegram/Slack/Discord). */
export function renderText(b: Briefing): string {
  const date = new Date(b.generatedAt).toISOString().slice(0, 10);
  const item = (a: ClassifiedAnnouncement) =>
    `• ${a.title}\n  ${fmtTime(a.publishedAt)}${a.url ? ` — ${a.url}` : ""}`;
  const section = (label: string, items: ClassifiedAnnouncement[], empty: string) =>
    `${label}\n${items.length ? items.map(item).join("\n") : empty}`;
  const parts = [
    `Bitget daily briefing — ${date} (last ${b.windowHours}h)`,
    section("🔴 CRITICAL:", b.critical, "  none 🎉"),
    section("🟡 Notable:", b.notable, "  none"),
  ];
  if (b.info.length) parts.push(`🟢 FYI: ${b.info.length} promo/misc item(s) — see full briefing.`);
  if (b.fetchErrors.length) parts.push(`⚠️ ${b.fetchErrors.length} fetch warning(s).`);
  return parts.join("\n\n");
}
