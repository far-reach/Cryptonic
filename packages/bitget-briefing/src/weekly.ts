import type { Briefing, ClassifiedAnnouncement } from "./types.js";
import { pairSuspendResume, escapeHtml } from "./telegram.js";
import { environmentGauge, scoreAnnouncement, starBar, tierDot } from "./importance.js";
import { humanTitle, humanWhy } from "./humanize.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDay(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export interface WeekEvent {
  item: ClassifiedAnnouncement;
  stars: number;
  /** "resolved" (came back), "active" (still down), or "info" (one-shot news). */
  status: "resolved" | "active" | "info";
}

export interface WeekStats {
  critical: number;
  notable: number;
  promos: number;
  freezes: number;
  backOnline: number;
  stillDown: number;
  delistings: number;
  listings: number;
  contractChanges: number;
}

export interface WeekSummary {
  events: WeekEvent[];
  stats: WeekStats;
}

/** Rank the week's news by importance, folding suspend→resume pairs into one incident. */
export function summarizeWeek(b: Briefing, top = 7): WeekSummary {
  const paired = pairSuspendResume(b.critical);
  const events: WeekEvent[] = [];
  let backOnline = 0;
  let stillDown = 0;

  for (const p of paired) {
    if (p.kind === "resolved") {
      backOnline++;
      // Represent the incident by its suspension (that's the event); resume-only pairs
      // (suspension outside the window) fall back to the resume item.
      const item = p.counterpart ?? p.item;
      events.push({ item, stars: scoreAnnouncement(item).stars, status: "resolved" });
    } else if (/suspend|halt|paus/i.test(p.item.title)) {
      stillDown++;
      events.push({ item: p.item, stars: scoreAnnouncement(p.item).stars, status: "active" });
    } else {
      events.push({ item: p.item, stars: scoreAnnouncement(p.item).stars, status: "info" });
    }
  }
  for (const a of b.notable) {
    events.push({ item: a, stars: scoreAnnouncement(a).stars, status: "info" });
  }

  events.sort(
    (x, y) => y.stars - x.stars || (y.item.publishedAt ?? 0) - (x.item.publishedAt ?? 0),
  );

  const all = [...b.critical, ...b.notable];
  const stats: WeekStats = {
    critical: b.critical.length,
    notable: b.notable.length,
    promos: b.info.length,
    freezes: backOnline + stillDown,
    backOnline,
    stillDown,
    delistings: all.filter((a) => /delist/i.test(a.title)).length,
    listings: all.filter((a) => /will list|lists |listing|listed/i.test(a.title) && !/delist/i.test(a.title)).length,
    contractChanges: all.filter((a) => /funding rate|leverage|margin tier|position (tier|limit)|tick size/i.test(a.title)).length,
  };
  return { events: events.slice(0, top), stats };
}

function weekRange(b: Briefing): string {
  const end = b.generatedAt;
  const start = end - (b.windowHours - 12) * 3_600_000; // label by covered days
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

function statusSuffix(e: WeekEvent): string {
  if (e.status === "resolved") return " — ✅ resolved";
  if (e.status === "active") return " — <b>still down</b>";
  return "";
}

function link(a: ClassifiedAnnouncement, label: string): string {
  return a.url ? `<a href="${escapeHtml(a.url)}">${escapeHtml(label)}</a>` : escapeHtml(label);
}

/** Telegram HTML for the Sunday weekly review. */
export function renderWeeklyTelegramHtml(
  b: Briefing,
  opts: { historyUrl?: string; compact?: boolean } = {},
): string {
  const divider = "──────────────";
  const { events, stats } = summarizeWeek(b);
  const gauge = environmentGauge([...b.critical, ...b.notable]);

  const head = opts.compact
    ? ""
    : [`📆 <b>Bitget Weekly Review</b> — ${weekRange(b)}`, divider].join("\n");
  const gaugeLine = `${gauge.emoji} <b>Week's tone:</b> <i>${escapeHtml(gauge.text)}</i>`;

  const topLines = events.map((e, i) => {
    const when = fmtDay(e.item.publishedAt);
    const why = e.stars >= 4 ? humanWhy(e.item) : null;
    const whyLine = why ? `\n      ℹ️ <i>${escapeHtml(why)}</i>` : "";
    return (
      `${i + 1}. ${tierDot(e.stars)} ${starBar(e.stars)} ${link(e.item, humanTitle(e.item))}` +
      `${when ? ` · <i>${escapeHtml(when)}</i>` : ""}${statusSuffix(e)}${whyLine}`
    );
  });

  const numbers = [
    `• 🔴 ${stats.critical} critical · 🟡 ${stats.notable} notable · 🎁 ${stats.promos} promos`,
    stats.freezes > 0
      ? `• ⏸ ${stats.freezes} transfer freeze${stats.freezes > 1 ? "s" : ""} — ✅ ${stats.backOnline} back online${stats.stillDown ? `, ⚠️ ${stats.stillDown} still down` : ""}`
      : "",
    stats.delistings || stats.listings || stats.contractChanges
      ? `• ⛔ ${stats.delistings} delisting${stats.delistings === 1 ? "" : "s"} · 🆕 ${stats.listings} listing${stats.listings === 1 ? "" : "s"} · ⚙️ ${stats.contractChanges} contract-rule change${stats.contractChanges === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);

  const sections = [
    gaugeLine,
    events.length
      ? `🏆 <b>Biggest events of the week</b>\n\n${topLines.join("\n\n")}`
      : `😌 <b>A quiet week — no significant events.</b>`,
    `📊 <b>Week in numbers</b>\n${numbers.join("\n")}`,
  ];

  const footer = opts.historyUrl
    ? `${divider}\n<a href="${escapeHtml(opts.historyUrl)}">📚 Briefing history</a>`
    : "";
  return [head, ...sections, footer].filter(Boolean).join("\n\n");
}

/** Caption for the weekly photo (the 7-day trend chart). */
export function renderWeeklyCaption(b: Briefing): string {
  const gauge = environmentGauge([...b.critical, ...b.notable]);
  return [
    `📆 <b>Bitget Weekly Review</b> — ${weekRange(b)}`,
    `🔴 <b>${b.critical.length} critical</b> · 🟡 ${b.notable.length} notable · 🎁 ${b.info.length} promos`,
    `${gauge.emoji} <i>${escapeHtml(gauge.text)}</i>`,
  ].join("\n");
}

/** Markdown version committed to briefings/weekly-<date>.md. */
export function renderWeeklyMarkdown(b: Briefing): string {
  const { events, stats } = summarizeWeek(b);
  const gauge = environmentGauge([...b.critical, ...b.notable]);
  const lines = [
    `# Bitget weekly review — ${weekRange(b)}`,
    "",
    `${gauge.emoji} **Week's tone:** _${gauge.text}_`,
    "",
    "## 🏆 Biggest events of the week",
    "",
    events.length
      ? events
          .map((e, i) => {
            const why = e.stars >= 4 ? humanWhy(e.item) : null;
            const status = e.status === "resolved" ? " — ✅ resolved" : e.status === "active" ? " — **still down**" : "";
            return (
              `${i + 1}. ${tierDot(e.stars)} ${starBar(e.stars)} [${humanTitle(e.item)}](${e.item.url}) · ${fmtDay(e.item.publishedAt)}${status}` +
              (why ? `\n   ℹ️ _${why}_` : "")
            );
          })
          .join("\n")
      : "_A quiet week — no significant events._",
    "",
    "## 📊 Week in numbers",
    "",
    `- ${stats.critical} critical · ${stats.notable} notable · ${stats.promos} promos`,
    `- ${stats.freezes} transfer freezes — ${stats.backOnline} back online, ${stats.stillDown} still down`,
    `- ${stats.delistings} delistings · ${stats.listings} listings · ${stats.contractChanges} contract-rule changes`,
    "",
  ];
  return lines.join("\n");
}
