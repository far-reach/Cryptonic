import type { ClassifiedAnnouncement, FetchLike } from "./types.js";

export type ReasonCause =
  | "security"
  | "network-upgrade"
  | "maintenance"
  | "migration"
  | "congestion"
  | "other";

export interface ArticleReason {
  cause: ReasonCause;
  /** One cleaned sentence from the article explaining the action (≤ ~180 chars). */
  excerpt: string;
}

const CAUSE_PATTERNS: Array<{ cause: ReasonCause; re: RegExp }> = [
  // Security first — it must win over generic wording in the same article.
  { cause: "security", re: /security (incident|issue|breach|concern|reasons)|exploit|hack|attack|vulnerabilit|compromis|phishing|abnormal (activity|transactions)/i },
  { cause: "network-upgrade", re: /network upgrade|hard ?fork|mainnet (upgrade|swap|launch)|chain upgrade|protocol upgrade|snapshot/i },
  { cause: "migration", re: /token (swap|migration|merge|split)|contract (swap|migration)|redenominat|rebrand/i },
  { cause: "congestion", re: /congest|instability|unstable|degraded|node (issues?|sync)|rpc issues?/i },
  { cause: "maintenance", re: /wallet (maintenance|upgrade)|scheduled maintenance|system (upgrade|maintenance)|technical (upgrade|maintenance)/i },
];

/** Strip tags/entities and collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the likely article body out of a Bitget support page (Next.js SSR). */
export function extractArticleText(html: string): string {
  const next = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (next) {
    try {
      const strings: string[] = [];
      const walk = (v: unknown): void => {
        if (typeof v === "string") {
          if (v.length > 120) strings.push(v);
        } else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      walk(JSON.parse(next[1]));
      // The content field is the longest rich string with sentence structure.
      const best = strings
        .map((s) => htmlToText(s))
        .filter((s) => /[.!?]\s/.test(s) || s.length > 200)
        .sort((a, b) => b.length - a.length)[0];
      if (best) return best;
    } catch {
      // fall through to whole-page text
    }
  }
  const full = htmlToText(html);
  // Bitget article bodies open with a salutation or the action lead-in; cutting
  // there drops the page chrome (nav, footers) that precedes the content.
  const lead = full.search(
    /dear (bitget )?users?|to support\b|due to\b|because of\b|as part of\b|in order to\b|((bitget|we) )?(will|has|have) (temporarily |now |been )?(suspend(ed)?|paus(e|ed)|halt(ed)?|resum(e|ed)|open(ed)?|reopen(ed)?)/i,
  );
  return lead >= 0 ? full.slice(lead) : full;
}

/** Site chrome that must never be quoted as an explanation. */
const CHROME_RE =
  /support center|buy crypto|sign ?up|log ?in|trade smarter|futures earn|square more|copy trading|download (the )?app|announcement center|help center|customer support/i;

/** Boilerplate filler that explains nothing — never worth quoting. */
const BOILERPLATE_RE =
  /if the (maintenance )?schedule|issue a further notice|we (sincerely )?apolog|thank you for|appreciate your|reach out|contact (us|support)|join bitget|follow us/i;

/** Classify the cause and pick the single most explanatory sentence. */
export function findReason(text: string): ArticleReason | null {
  if (!text) return null;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) =>
        s.length >= 25 && s.length <= 300 && !CHROME_RE.test(s) && !BOILERPLATE_RE.test(s) && !/\|/.test(s),
    );
  let cause: ReasonCause = "other";
  for (const { cause: c, re } of CAUSE_PATTERNS) {
    if (re.test(text)) {
      cause = c;
      break;
    }
  }
  const causeRe = CAUSE_PATTERNS.find((p) => p.cause === cause)?.re;
  const explanatory =
    (causeRe && sentences.find((s) => causeRe.test(s))) ??
    sentences.find((s) => /due to|because|as (a result|part) of|to (support|ensure|complete)|in order to/i.test(s)) ??
    // Resumption articles often state only the fact — quote that line
    // ("has now opened the withdrawal service", "services have resumed").
    sentences.find((s) =>
      /resum(ed|ption)|(open(ed)?|reopen(ed)?|restor(ed)?)\b[^.]*\b(deposit|withdrawal)|(deposit|withdrawal)[^.]*\b(open(ed)?|reopen(ed)?|resum(ed)?|restor(ed)?)/i.test(s),
    );
  // Junk-free excerpt or nothing: a missing why-line beats quoting page chrome.
  if (!explanatory) return null;
  let excerpt = explanatory.trim().replace(/^dear (bitget )?users?[:,.]?\s*/i, "");
  excerpt = excerpt.charAt(0).toUpperCase() + excerpt.slice(1);
  if (excerpt.length > 180) excerpt = excerpt.slice(0, 177).trimEnd() + "…";
  return { cause, excerpt };
}

/**
 * Fetch article pages for the given announcements and attach the extracted
 * reason in place. Best-effort with a hard cap: failures leave items unchanged.
 */
export async function attachReasons(
  anns: ClassifiedAnnouncement[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  limit = 8,
): Promise<void> {
  const targets = anns.filter((a) => a.url).slice(0, limit);
  await Promise.allSettled(
    targets.map(async (a) => {
      const res = await fetchFn(a.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html",
        },
      });
      if (!res.ok) return;
      const reason = findReason(extractArticleText(await res.text()));
      if (reason) a.reason = reason;
    }),
  );
}
