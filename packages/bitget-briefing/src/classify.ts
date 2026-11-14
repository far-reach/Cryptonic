import type { Announcement, ClassifiedAnnouncement, Section, Severity } from "./types.js";

/** Baseline severity implied by the section an announcement was published under. */
const SECTION_BASELINE: Record<Section, Severity> = {
  symbol_delisting: "critical",
  maintenance_system_updates: "critical",
  security: "critical",
  latest_news: "info",
  coin_listings: "notable",
  product_updates: "notable",
  api_trading: "notable",
  trading_competitions_promotions: "info",
};

interface Pattern {
  re: RegExp;
  reason: string;
}

/** Things that can cost you money or lock you out — always surface these. */
const CRITICAL_PATTERNS: Pattern[] = [
  { re: /delist/i, reason: "delisting" },
  { re: /suspen[ds]/i, reason: "suspension" },
  { re: /\bhalt(s|ed|ing)?\b/i, reason: "trading halt" },
  { re: /maintenance/i, reason: "maintenance window" },
  { re: /network upgrade|hard ?fork|chain upgrade/i, reason: "network upgrade affecting transfers" },
  { re: /deposit(s)?\s+(and|&|\/)?\s*withdrawal(s)?/i, reason: "deposit/withdrawal change" },
  { re: /withdraw(al)?s?\s+(closed|paused|disabled)/i, reason: "withdrawals disabled" },
  { re: /securit|vulnerab|exploit|phishing|breach|incident/i, reason: "security notice" },
  { re: /risk (warning|alert|control)/i, reason: "risk warning" },
  { re: /\bST\b/, reason: "special treatment (ST) tag" },
  { re: /terminat|cease|discontinu|shut ?down/i, reason: "service termination" },
  { re: /token (swap|split|merge|migration|redenomination)|contract (swap|migration)/i, reason: "token swap/migration" },
  { re: /(adjust|chang)\w*\s.*\b(leverage|funding rate|margin tier|tick size|position limit)/i, reason: "contract parameter change" },
  { re: /\b(leverage|funding rate|margin tier|tick size|position limit)s?\b.*\b(adjust|chang)/i, reason: "contract parameter change" },
  { re: /emergency|freez/i, reason: "emergency action" },
  { re: /rebrand|redenominat|ticker change|renam/i, reason: "ticker/renaming change" },
];

/** Tradeable or integration-relevant, but not dangerous to ignore for a day. */
const NOTABLE_PATTERNS: Pattern[] = [
  { re: /will list|lists |listing|listed|launch(es|ing)? .*(spot|futures|perpetual)/i, reason: "new listing" },
  { re: /launchpool|launchpad|pre-?market|candybomb|poolx/i, reason: "token launch event" },
  { re: /futures|perpetual|margin/i, reason: "derivatives/margin update" },
  { re: /\bAPI\b|websocket|endpoint/i, reason: "API change" },
  { re: /fee (schedule|adjust|chang|update)/i, reason: "fee change" },
  { re: /proof of reserves|por\b/i, reason: "proof of reserves" },
];

const RANK: Record<Severity, number> = { critical: 2, notable: 1, info: 0 };

/** Classify one announcement from its section plus title/description keywords. */
export function classify(ann: Announcement): ClassifiedAnnouncement {
  const text = `${ann.title} ${ann.description ?? ""}`;
  const reasons: string[] = [];
  let severity: Severity = SECTION_BASELINE[ann.section];
  if (severity !== "info") reasons.push(`section: ${ann.section.replace(/_/g, " ")}`);

  for (const { re, reason } of CRITICAL_PATTERNS) {
    if (re.test(text)) {
      severity = "critical";
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }
  if (RANK[severity] < RANK.critical) {
    for (const { re, reason } of NOTABLE_PATTERNS) {
      if (re.test(text)) {
        if (RANK[severity] < RANK.notable) severity = "notable";
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }
  }
  return { ...ann, severity, reasons };
}

export function classifyAll(anns: Announcement[]): ClassifiedAnnouncement[] {
  return anns.map(classify);
}
