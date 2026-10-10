import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DayCounts {
  /** ISO date, e.g. "2026-07-18". */
  date: string;
  critical: number;
  notable: number;
  info: number;
}

/** Parse the TL;DR counts line out of a committed briefing markdown file. */
export function parseTldr(markdown: string): Omit<DayCounts, "date"> | null {
  const m = markdown.match(/\*\*TL;DR:\*\*\s*(\d+) critical · (\d+) notable · (\d+) FYI/);
  if (!m) return null;
  return { critical: Number(m[1]), notable: Number(m[2]), info: Number(m[3]) };
}

/**
 * Read all dated briefing files (briefings/YYYY-MM-DD.md) into per-day counts.
 * Missing directory or unparsable files are skipped — history is best-effort.
 */
export function loadHistory(dir: string): DayCounts[] {
  if (!existsSync(dir)) return [];
  const out: DayCounts[] = [];
  for (const name of readdirSync(dir)) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m) continue;
    try {
      const counts = parseTldr(readFileSync(join(dir, name), "utf8"));
      if (counts) out.push({ date: m[1], ...counts });
    } catch {
      // unreadable file — skip
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface TrendSeries {
  /** Short display labels, oldest → today (e.g. "Jul 12"). */
  labels: string[];
  critical: Array<number | null>;
  notable: Array<number | null>;
  info: Array<number | null>;
  /** How many of the 7 days actually have data. */
  daysWithData: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build the last-7-days series ending today. Days without a committed briefing
 * are null (the chart spans the gaps); today's counts come from the current
 * briefing, which is fresher than anything on disk.
 */
export function buildTrendSeries(
  history: DayCounts[],
  now: number,
  today: { critical: number; notable: number; info: number },
): TrendSeries {
  const byDate = new Map(history.map((h) => [h.date, h]));
  const labels: string[] = [];
  const critical: Array<number | null> = [];
  const notable: Array<number | null> = [];
  const info: Array<number | null> = [];
  let daysWithData = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    labels.push(`${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`);
    const entry = i === 0 ? { date: iso, ...today } : byDate.get(iso);
    if (entry) {
      daysWithData++;
      critical.push(entry.critical);
      notable.push(entry.notable);
      info.push(entry.info);
    } else {
      critical.push(null);
      notable.push(null);
      info.push(null);
    }
  }
  return { labels, critical, notable, info, daysWithData };
}
