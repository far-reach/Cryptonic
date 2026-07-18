import type { Briefing, ClassifiedAnnouncement } from "./types.js";

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

/** Strip boilerplate lead-ins so the subject stands on its own. */
export function condenseTitle(title: string): string {
  let t = title
    .replace(/^bitget announcement (on|regarding)\s+/i, "")
    .replace(/^announcement (on|of|regarding)\s+(the\s+)?/i, "")
    .replace(/^notice (on|of|regarding)\s+(the\s+)?/i, "")
    .replace(/^bitget (to|will)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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
  // Second pass: everything unmatched stands on its own.
  for (const a of items) {
    if (!used.has(a.id)) out.push({ kind: "single", item: a });
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

function renderPaired(p: PairedItem): string {
  if (p.kind === "resolved" && p.counterpart) {
    // Subject from the resume title, verbs stripped: "USDC - APTOS withdrawals"
    const subject = condenseTitle(p.item.title).replace(/^resum\w*\s+/i, "");
    const from = fmtTime(p.counterpart.publishedAt);
    const to = fmtTime(p.item.publishedAt);
    return `✅ ${link(p.item, subject)}\n      <i>⏸ ${escapeHtml(from)} → ✅ ${escapeHtml(to)} UTC — back to normal</i>`;
  }
  const a = p.item;
  const when = fmtTime(a.publishedAt);
  const time = when ? `\n      <i>${escapeHtml(when)} UTC</i>` : "";
  return `${glyphFor(a)} ${link(a, condenseTitle(a.title))}${time}`;
}

/**
 * Render the briefing as Telegram HTML (parse_mode: "HTML"): linked titles instead
 * of raw URLs, status glyphs, suspend→resume pairing, and a compact layout.
 */
export function renderTelegramHtml(b: Briefing, opts: { historyUrl?: string } = {}): string {
  const divider = "──────────────";
  const critical = pairSuspendResume(b.critical);
  const active = critical.filter((p) => p.kind === "single");
  const resolved = critical.filter((p) => p.kind === "resolved");

  const head = [
    `📊 <b>Bitget Daily Briefing</b> — ${fmtDay(b.generatedAt)}`,
    divider,
    `🔴 <b>${b.critical.length} critical</b> · 🟡 ${b.notable.length} notable · 🎁 ${b.info.length} promo`,
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
    sections.push(`🟡 <b>Worth a look</b>\n\n${b.notable.map((a) => renderPaired({ kind: "single", item: a })).join("\n\n")}`);
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
