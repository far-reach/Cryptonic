import type { Briefing, ClassifiedAnnouncement } from "./types.js";
import type { TrendSeries } from "./history.js";
import { formatLevels, STANCE_GLYPH } from "./signals.js";
import { environmentGauge, scoreAnnouncement, starBar, tierDot } from "./importance.js";
import { condenseTitle, humanTitle, humanWhy } from "./humanize.js";

/** Telegram sendMessage hard limit is 4096 chars; leave headroom for the footer. */
const MAX_LEN = 3900;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtTime(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${fmtDay(ms)}, ${hh}:${mm}`;
}

export { condenseTitle } from "./humanize.js";

/** Pick the status glyph that "shows instead of tells". */
export function glyphFor(a: ClassifiedAnnouncement): string {
  const t = `${a.title} ${a.reasons.join(" ")}`.toLowerCase();
  if (/resum/.test(t)) return "✅";
  if (/delist/.test(t)) return "⛔";
  if (/suspen|halt|paus|disabled|freez/.test(t)) return "⏸";
  if (/securit|vulnerab|exploit|phishing|breach/.test(t)) return "🛡";
  if (/maintenance|upgrade/.test(t)) return "🔧";
  if (/funding rate|leverage|margin tier|tick size|position limit|contract parameter/.test(t)) return "⚙️";
  if (/list|launch/.test(t)) return "🆕";
  if (/api|websocket|endpoint/.test(t)) return "🔌";
  if (/prize|competition|carnival|reward|airdrop|share/.test(t)) return "🎁";
  return "📌";
}

const STOP_WORDS = new Set([
  "bitget", "announcement", "notice", "on", "of", "the", "for", "a", "an", "and", "to",
  "suspending", "suspension", "suspend", "suspended", "resuming", "resumption", "resume",
  "resumed", "temporarily", "temporary", "service", "services", "deposit", "deposits",
  "withdrawal", "withdrawals", "network",
]);

/** Normalize a title to the asset/subject it is about, for suspend↔resume pairing. */
export function subjectKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .sort()
    .join(" ");
}

export interface PairedItem {
  kind: "single" | "resolved";
  item: ClassifiedAnnouncement;
  /** For "resolved": the earlier suspension the resumption cleared. */
  counterpart?: ClassifiedAnnouncement;
}

/**
 * Collapse suspend→resume pairs about the same subject into one "resolved" entry,
 * so a fixed outage reads as good news instead of two alarming lines.
 * Unresolved problems sort first.
 */
export function pairSuspendResume(items: ClassifiedAnnouncement[]): PairedItem[] {
  const isResume = (a: ClassifiedAnnouncement) => /resum/i.test(a.title);
  const isSuspend = (a: ClassifiedAnnouncement) => /suspen|halt|paus/i.test(a.title);
  const used = new Set<string>();
  const out: PairedItem[] = [];

  // First pass: match every resumption to its earlier suspension.
  for (const a of items) {
    if (!isResume(a)) continue;
    const key = subjectKey(a.title);
    const match = items.find(
      (b) =>
        !used.has(b.id) &&
        b.id !== a.id &&
        isSuspend(b) &&
        subjectKey(b.title) === key &&
        (b.publishedAt ?? 0) <= (a.publishedAt ?? Infinity),
    );
    if (match) {
      used.add(a.id);
      used.add(match.id);
      out.push({ kind: "resolved", item: a, counterpart: match });
    }
  }
  // Second pass: everything unmatched stands on its own. A lone resumption
  // (its suspension predates the briefing window) is still good news — file it
  // under "resolved" so it never sits beside active problems.
  for (const a of items) {
    if (!used.has(a.id)) out.push({ kind: isResume(a) ? "resolved" : "single", item: a });
  }

  // Active problems first, resolved pairs last; newest first within each group.
  return out.sort((x, y) => {
    if (x.kind !== y.kind) return x.kind === "resolved" ? 1 : -1;
    return (y.item.publishedAt ?? 0) - (x.item.publishedAt ?? 0);
  });
}

function link(a: ClassifiedAnnouncement, label: string): string {
  const safe = escapeHtml(label);
  return a.url ? `<a href="${escapeHtml(a.url)}">${safe}</a>` : safe;
}

/** "why" line: plain-language explanation, with a loud flag for security causes. */
function reasonLine(a: ClassifiedAnnouncement): string {
  const parts: string[] = [];
  const why = humanWhy(a);
  if (why) parts.push(`\n      ℹ️ <i>${escapeHtml(why)}</i>`);
  if (a.reason?.cause === "security") {
    parts.push(`\n      🛡 <b>Security-related — treat as elevated risk</b>`);
  }
  return parts.join("");
}

function renderPaired(p: PairedItem): string {
  if (p.kind === "resolved") {
    // Recoveries aren't tradeable — one line, no stars, no quotes.
    const subject = humanTitle(p.item);
    const to = fmtTime(p.item.publishedAt);
    const journey = p.counterpart
      ? `⏸ ${escapeHtml(fmtTime(p.counterpart.publishedAt))} → ✅ ${escapeHtml(to)} UTC`
      : `resumed ${escapeHtml(to)} UTC`;
    return `✅ ${link(p.item, subject)}\n      <i>${journey}</i>`;
  }
  const a = p.item;
  const { stars, label } = scoreAnnouncement(a);
  const when = fmtTime(a.publishedAt);
  if (stars <= 2) {
    // Routine news: one compact line, no card.
    return `${glyphFor(a)} ${link(a, humanTitle(a))}\n      ${tierDot(stars)} <i>★${stars} ${escapeHtml(label)}${when ? ` · ${escapeHtml(when)} UTC` : ""}</i>`;
  }
  // Tradeable news (★3+): full card with the why.
  return `${glyphFor(a)} ${link(a, humanTitle(a))}\n      ${tierDot(stars)} ${starBar(stars)} <i>${escapeHtml(label)}${when ? ` · ${escapeHtml(when)} UTC` : ""}</i>${reasonLine(a)}`;
}

/**
 * Build a QuickChart URL for the day's summary card: a dark-themed horizontal
 * bar chart of severity counts. Telegram fetches the URL itself (sendPhoto),
 * so no image rendering happens in the bot.
 */
function chartUrl(config: unknown): string {
  const params = new URLSearchParams({
    version: "3",
    w: "700",
    h: "360",
    devicePixelRatio: "2",
    backgroundColor: "#111827",
    c: JSON.stringify(config),
  });
  return `https://quickchart.io/chart?${params}`;
}

/**
 * 7-day trend line chart: critical (red, filled), notable (amber), promos
 * (green), today's point emphasized. Used once ≥2 days of history exist.
 */
export function buildTrendChartUrl(b: Briefing, trend: TrendSeries): string {
  const allValues = [...trend.critical, ...trend.notable, ...trend.info].filter(
    (v): v is number => v !== null,
  );
  const max = Math.max(...allValues, 1);
  const emphasizeToday = (base: number, today: number) =>
    trend.labels.map((_, i) => (i === trend.labels.length - 1 ? today : base));
  const line = (label: string, data: Array<number | null>, color: string) => ({
    label,
    data,
    borderColor: color,
    pointBackgroundColor: color,
    pointBorderColor: color,
    borderWidth: 2,
    tension: 0.35,
    spanGaps: true,
    fill: false,
    pointRadius: emphasizeToday(3, 6),
  });
  const config = {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [
        {
          ...line("Critical", trend.critical, "#ef4444"),
          borderWidth: 3,
          backgroundColor: "rgba(239,68,68,0.15)",
          fill: true,
        },
        line("Notable", trend.notable, "#f59e0b"),
        line("Promos", trend.info, "#22c55e"),
      ],
    },
    options: {
      layout: { padding: { top: 8, right: 24, bottom: 8, left: 8 } },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#e5e7eb", usePointStyle: true, boxWidth: 8, font: { size: 13 }, padding: 16 },
        },
        title: {
          display: true,
          text: ["Bitget Daily Briefing", `${fmtDay(b.generatedAt)} — 7-day trend`],
          color: "#f9fafb",
          font: { size: 22, weight: "bold" },
          padding: { top: 12, bottom: 12 },
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: "#9ca3af", font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          suggestedMax: max + 1,
          grid: { color: "rgba(255,255,255,0.06)", drawBorder: false },
          ticks: { color: "#6b7280", stepSize: 1, precision: 0, font: { size: 11 } },
        },
      },
    },
  };
  return chartUrl(config);
}

export function buildSummaryChartUrl(b: Briefing, trend?: TrendSeries | null): string {
  // With real history, show the 7-day trend; on day one fall back to today's bars.
  if (trend && trend.daysWithData >= 2) return buildTrendChartUrl(b, trend);
  const counts = [b.critical.length, b.notable.length, b.info.length];
  const max = Math.max(...counts, 1);
  // Chart.js v3: rounded horizontal bars, no axis clutter — the numbers are the story.
  const config = {
    type: "bar",
    data: {
      labels: ["Critical", "Notable", "Promos"],
      datasets: [
        {
          data: counts,
          backgroundColor: ["#ef4444", "#f59e0b", "#22c55e"],
          borderWidth: 0,
          borderRadius: 10,
          borderSkipped: false,
          barThickness: 36,
        },
      ],
    },
    options: {
      indexAxis: "y",
      layout: { padding: { top: 8, right: 64, bottom: 12, left: 12 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: ["Bitget Daily Briefing", `${fmtDay(b.generatedAt)} — last ${b.windowHours}h`],
          color: "#f9fafb",
          font: { size: 22, weight: "bold" },
          padding: { top: 12, bottom: 20 },
        },
        datalabels: {
          anchor: "end",
          align: "right",
          offset: 8,
          color: "#f9fafb",
          font: { size: 22, weight: "bold" },
        },
      },
      scales: {
        x: { display: false, suggestedMax: max + 1, beginAtZero: true },
        y: {
          grid: { display: false, drawBorder: false },
          ticks: { color: "#e5e7eb", font: { size: 17, weight: "600" } },
        },
      },
    },
  };
  return chartUrl(config);
}

/** Short HTML caption for the summary image (Telegram caps captions at 1024 chars). */
export function renderTelegramCaption(b: Briefing): string {
  const counts = `🔴 <b>${b.critical.length} critical</b> · 🟡 ${b.notable.length} notable · 🎁 ${b.info.length} promo`;
  const gauge = environmentGauge([...b.critical, ...b.notable]);
  return [
    `📊 <b>Bitget Daily Briefing</b> — ${fmtDay(b.generatedAt)}`,
    counts,
    `${gauge.emoji} <i>${escapeHtml(gauge.text)}</i>`,
  ].join("\n");
}

/**
 * Render the briefing as Telegram HTML (parse_mode: "HTML"): linked titles instead
 * of raw URLs, status glyphs, suspend→resume pairing, and a compact layout.
 */
export function renderTelegramHtml(
  b: Briefing,
  opts: { historyUrl?: string; compact?: boolean } = {},
): string {
  const divider = "──────────────";
  const critical = pairSuspendResume(b.critical);
  const byStars = (x: PairedItem, y: PairedItem) =>
    scoreAnnouncement(y.item).stars - scoreAnnouncement(x.item).stars ||
    (y.item.publishedAt ?? 0) - (x.item.publishedAt ?? 0);
  const active = critical.filter((p) => p.kind === "single").sort(byStars);
  const resolved = critical.filter((p) => p.kind === "resolved");
  const allItems = [...b.critical, ...b.notable];
  const gauge = environmentGauge(allItems);
  const gaugeLine = `${gauge.emoji} <b>Environment:</b> <i>${escapeHtml(gauge.text)}</i>`;

  // compact: the summary photo + caption already carry the title and counts.
  const head = opts.compact
    ? gaugeLine
    : [
        `📊 <b>Bitget Daily Briefing</b> — ${fmtDay(b.generatedAt)}`,
        divider,
        `🔴 <b>${b.critical.length} critical</b> · 🟡 ${b.notable.length} notable · 🎁 ${b.info.length} promo`,
        gaugeLine,
      ].join("\n");

  const sections: string[] = [];
  if (active.length) {
    sections.push(`🚨 <b>Needs attention</b>\n\n${active.map(renderPaired).join("\n\n")}`);
  }
  if (resolved.length) {
    sections.push(`💚 <b>Resolved</b>\n\n${resolved.map(renderPaired).join("\n\n")}`);
  }
  if (!active.length && !resolved.length) {
    sections.push(`😌 <b>Nothing critical today.</b>`);
  }
  if (b.notable.length) {
    const notableSorted = [...b.notable].sort(
      (x, y) => scoreAnnouncement(y).stars - scoreAnnouncement(x).stars,
    );
    sections.push(`🟡 <b>Worth a look</b>\n\n${notableSorted.map((a) => renderPaired({ kind: "single", item: a })).join("\n\n")}`);
  }
  // Tradeable angles only: a signal without an identifiable asset isn't actionable.
  const tradeable = b.signals
    .filter((s) => s.asset)
    .sort((x, y) => scoreAnnouncement(y.source).stars - scoreAnnouncement(x.source).stars)
    .slice(0, 4);
  if (tradeable.length) {
    const lines = tradeable.map((s) => {
      const stars = scoreAnnouncement(s.source).stars;
      const chip = stars >= 4 ? `🔥 ` : "";
      const asset = s.asset ? `<b>${escapeHtml(s.asset)}</b> <i>(★${stars})</i> — ` : "";
      const levels = s.levels ? `\n      <code>${escapeHtml(formatLevels(s.levels))}</code>` : "";
      return `${chip}${STANCE_GLYPH[s.stance]} ${asset}${escapeHtml(s.note)}${levels}`;
    });
    sections.push(
      `💡 <b>Trade angles</b>\n\n${lines.join("\n\n")}\n\n<i>Pattern heuristics from historical announcement studies — not financial advice.</i>`,
    );
  }
  let infoSection = "";
  if (b.info.length) {
    infoSection = `🎁 <i>${b.info.length} promo/misc item${b.info.length > 1 ? "s" : ""} skipped</i>`;
  }

  const footer = opts.historyUrl
    ? `${divider}\n<a href="${escapeHtml(opts.historyUrl)}">📚 Briefing history</a>`
    : "";

  const assemble = (secs: string[]) =>
    [head, ...secs, infoSection, footer].filter(Boolean).join("\n\n");

  let msg = assemble(sections);
  if (msg.length > MAX_LEN) {
    // Degrade gracefully: cap each section's items rather than cutting mid-tag.
    const capped = sections.map((s) => {
      const [title, ...items] = s.split("\n\n");
      const keep = items.slice(0, 6);
      const dropped = items.length - keep.length;
      return [title, ...keep, dropped > 0 ? `<i>…and ${dropped} more</i>` : ""].filter(Boolean).join("\n\n");
    });
    msg = assemble(capped);
  }
  return msg;
}
