/** Announcement sections exposed by Bitget's public announcements API. */
export const SECTIONS = [
  "symbol_delisting",
  "maintenance_system_updates",
  "security",
  "latest_news",
  "coin_listings",
  "product_updates",
  "api_trading",
  "trading_competitions_promotions",
] as const;

export type Section = (typeof SECTIONS)[number];

export type Severity = "critical" | "notable" | "info";

export interface Announcement {
  /** Bitget announcement id (annId), or the article id extracted from a URL. */
  id: string;
  title: string;
  description?: string;
  url: string;
  section: Section;
  /** Publish time in ms since epoch, or null when the source didn't provide one. */
  publishedAt: number | null;
}

export interface ClassifiedAnnouncement extends Announcement {
  severity: Severity;
  /** Human-readable reasons the classifier picked this severity. */
  reasons: string[];
}

export interface Briefing {
  generatedAt: number;
  windowHours: number;
  critical: ClassifiedAnnouncement[];
  notable: ClassifiedAnnouncement[];
  info: ClassifiedAnnouncement[];
  /** Sections that failed to fetch (network errors, geo-blocks, …). */
  fetchErrors: string[];
}

/** Minimal fetch signature so tests and callers can inject a mock. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
