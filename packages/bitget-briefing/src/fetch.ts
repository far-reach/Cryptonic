import type { Announcement, FetchLike, Section } from "./types.js";
import { SECTIONS } from "./types.js";

export interface FetchOptions {
  /** e.g. "en_US" (default) or "zh_CN". */
  language?: string;
  /** Only announcements published at/after this time (ms). */
  startTime?: number;
  /** Only announcements published at/before this time (ms). */
  endTime?: number;
  /** Override the API origin (default https://api.bitget.com). */
  apiBase?: string;
  /** Override the website origin used for the HTML fallback (default https://www.bitget.com). */
  webBase?: string;
  fetchFn?: FetchLike;
  /** Sections to pull; defaults to all of them. */
  sections?: readonly Section[];
}

export interface FetchResult {
  announcements: Announcement[];
  /** One entry per section or fallback source that failed. */
  errors: string[];
}

const DEFAULT_API_BASE = "https://api.bitget.com";
const DEFAULT_WEB_BASE = "https://www.bitget.com";
// Bitget's v2 docs spell the path "annoucements"; we try the correct spelling too.
const API_PATHS = ["/api/v2/public/annoucements", "/api/v2/public/announcements"];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
};

/** Map one raw API row into an Announcement; returns null for unusable rows. */
export function parseApiRow(row: unknown, section: Section): Announcement | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const title = typeof r.annTitle === "string" ? r.annTitle.trim() : "";
  if (!title) return null;
  const url = typeof r.annUrl === "string" ? r.annUrl : "";
  const id =
    typeof r.annId === "string" && r.annId
      ? r.annId
      : url.match(/articles\/(\d+)/)?.[1] ?? `${section}:${title}`;
  const cTime = typeof r.cTime === "string" || typeof r.cTime === "number" ? Number(r.cTime) : NaN;
  return {
    id,
    title,
    description: typeof r.annDesc === "string" && r.annDesc ? r.annDesc : undefined,
    url,
    section,
    publishedAt: Number.isFinite(cTime) && cTime > 0 ? cTime : null,
  };
}

/** Parse a full API response body for one section. Throws on API-level errors. */
export function parseApiResponse(body: string, section: Section): Announcement[] {
  const json = JSON.parse(body) as { code?: string; msg?: string; data?: unknown };
  if (json.code !== undefined && json.code !== "00000") {
    throw new Error(`Bitget API error ${json.code}: ${json.msg ?? "unknown"}`);
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return data
    .map((row) => parseApiRow(row, section))
    .filter((a): a is Announcement => a !== null);
}

/**
 * HTML fallback: pull `/support/articles/<id>` links out of the announcement-center page.
 * Timestamps aren't reliably present in the markup, so publishedAt is null here.
 */
export function parseAnnouncementCenterHtml(html: string, webBase = DEFAULT_WEB_BASE): Announcement[] {
  const out = new Map<string, Announcement>();
  const anchorRe = /<a\b[^>]*href="([^"]*\/support\/articles\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, href, id, inner] = m;
    const title = inner
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (!title || out.has(id)) continue;
    out.set(id, {
      id,
      title,
      url: href.startsWith("http") ? href : `${webBase}${href.startsWith("/") ? "" : "/"}${href}`,
      section: "latest_news",
      publishedAt: null,
    });
  }
  return [...out.values()];
}

async function fetchSection(section: Section, opts: FetchOptions): Promise<Announcement[]> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  const base = opts.apiBase ?? DEFAULT_API_BASE;
  let lastError: Error = new Error("no API path attempted");
  for (const path of API_PATHS) {
    const params = new URLSearchParams({ language: opts.language ?? "en_US", annType: section });
    if (opts.startTime) params.set("startTime", String(opts.startTime));
    if (opts.endTime) params.set("endTime", String(opts.endTime));
    const url = `${base}${path}?${params}`;
    try {
      const res = await fetchFn(url, { headers: BROWSER_HEADERS });
      if (res.status === 404) {
        lastError = new Error(`404 at ${path}`);
        continue; // try the alternate spelling
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseApiResponse(await res.text(), section);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError;
}

async function fetchHtmlFallback(opts: FetchOptions): Promise<Announcement[]> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  const webBase = opts.webBase ?? DEFAULT_WEB_BASE;
  const pages = [`${webBase}/asia/support/announcement-center`, `${webBase}/support/announcement-center`];
  let lastError: Error = new Error("no page attempted");
  for (const url of pages) {
    try {
      const res = await fetchFn(url, { headers: { ...BROWSER_HEADERS, Accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const anns = parseAnnouncementCenterHtml(await res.text(), webBase);
      if (anns.length > 0) return anns;
      lastError = new Error(`no announcement links found at ${url}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError;
}

/**
 * Fetch announcements from all sections via the public API, de-duplicated and sorted
 * newest-first. If every API section fails, falls back to scraping the announcement-center
 * HTML page. Per-section failures are reported in `errors` rather than thrown, so a single
 * flaky section doesn't sink the briefing.
 */
export async function fetchAnnouncements(opts: FetchOptions = {}): Promise<FetchResult> {
  const sections = opts.sections ?? SECTIONS;
  const errors: string[] = [];
  const byId = new Map<string, Announcement>();

  const results = await Promise.allSettled(sections.map((s) => fetchSection(s, opts)));
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      for (const ann of result.value) {
        // Sections overlap (latest_news mirrors others); keep the more specific section.
        const existing = byId.get(ann.id);
        if (!existing || existing.section === "latest_news") byId.set(ann.id, ann);
      }
    } else {
      errors.push(`section ${sections[i]}: ${result.reason?.message ?? result.reason}`);
    }
  });

  if (byId.size === 0) {
    try {
      for (const ann of await fetchHtmlFallback(opts)) byId.set(ann.id, ann);
      errors.push("API unreachable; used HTML fallback (timestamps unavailable)");
    } catch (err) {
      errors.push(`HTML fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const announcements = [...byId.values()].sort(
    (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
  );
  return { announcements, errors };
}
