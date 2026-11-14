import type { ScanResult } from "./types.js";

const fmtBps = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(1)} bps`;
const fmtPct = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtPrice = (n: number): string => (n >= 1000 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(4));
const fmtMoney = (n: number): string => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "∞");

function table(header: string[], rows: string[][]): string {
  if (rows.length === 0) return "_none_\n";
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n") + "\n";
}

/** Markdown report in the same voice as the Bitget briefing: the actionable rows first, the caveats last. */
export function renderMarkdown(r: ScanResult, limit = 15): string {
  const p = r.params;
  const lines: string[] = [];
  lines.push(`# Arbitrage scan — ${new Date(r.generatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC\n`);
  lines.push(
    `Sized at **${fmtMoney(p.notionalQuote)}** per leg, taker fees on every fill, quotes in ${p.quotes.join("/")}; ` +
      `carry amortised over ${p.holdDays} days. Venues read: ` +
      Object.entries(r.quoteCounts)
        .map(([v, n]) => `${v} ${n} spot / ${r.perpCounts[v] ?? 0} perp`)
        .join(", ") +
      ".\n",
  );

  lines.push(`## 🔁 Cross-exchange (buy low here, sell high there) — ${r.crossExchange.length} ≥ ${fmtBps(p.minNetBps)}\n`);
  lines.push(
    table(
      ["Market", "Buy @", "Sell @", "Gross", "Net (pre-funded)", "Net after transfer", "Max size", "Depth"],
      r.crossExchange.slice(0, limit).map((o) => [
        `${o.base}/${o.quote}`,
        `${o.buyVenue} ${fmtPrice(o.buyPrice)}`,
        `${o.sellVenue} ${fmtPrice(o.sellPrice)}`,
        fmtBps(o.grossBps),
        `**${fmtBps(o.netBps)}**`,
        o.netAfterTransferBps === undefined ? "?" : `${fmtBps(o.netAfterTransferBps)} (~${o.transferMinutes} min)`,
        fmtMoney(o.maxNotionalQuote),
        o.depthChecked ? "book" : "top",
      ]),
    ),
  );

  lines.push(`## 🔺 Triangular (single venue) — ${r.triangular.length}\n`);
  lines.push(
    table(
      ["Venue", "Path", "Gross", "Fees", "Net", "Max start size"],
      r.triangular.slice(0, limit).map((o) => [
        o.venue,
        o.path.join(" → "),
        fmtBps(o.grossBps),
        `−${o.feesBps.toFixed(0)}`,
        `**${fmtBps(o.netBps)}**`,
        fmtMoney(o.maxNotionalStart),
      ]),
    ),
  );

  lines.push(`## 💸 Spot/perp carry (collect funding) — ${r.basis.length}\n`);
  lines.push(
    table(
      ["Asset", "Spot", "Perp", "Direction", "Funding / interval", "Gross APR", "Net APR", "Fees back in", "Basis"],
      r.basis.slice(0, limit).map((o) => [
        o.base,
        o.spotVenue,
        o.perpVenue,
        o.direction === "long-spot-short-perp" ? "long spot / short perp" : "short spot / long perp ⚠︎ needs borrow",
        `${(o.fundingRate * 100).toFixed(4)}% / ${o.fundingIntervalHours}h`,
        fmtPct(o.fundingAprPct),
        `**${fmtPct(o.netAprPct)}**`,
        Number.isFinite(o.breakevenHours) ? `${o.breakevenHours.toFixed(0)} h` : "never",
        fmtBps(o.basisBps),
      ]),
    ),
  );

  lines.push(`## ⚖️ Funding spread (long perp here, short perp there) — ${r.fundingSpread.length}\n`);
  lines.push(
    table(
      ["Asset", "Long (low funding)", "Short (high funding)", "Spread / interval", "Gross APR", "Net APR"],
      r.fundingSpread.slice(0, limit).map((o) => [
        o.base,
        `${o.longVenue} ${(o.longFundingRate * 100).toFixed(4)}%`,
        `${o.shortVenue} ${(o.shortFundingRate * 100).toFixed(4)}%`,
        `${(o.spread * 100).toFixed(4)}% / ${o.fundingIntervalHours}h`,
        fmtPct(o.spreadAprPct),
        `**${fmtPct(o.netAprPct)}**`,
      ]),
    ),
  );

  if (r.suspicious.length) {
    lines.push(`## 🚩 Suspicious gaps (probably not the same asset, or a halted market) — ${r.suspicious.length}\n`);
    lines.push(
      table(
        ["Market", "Buy @", "Sell @", "Gross"],
        r.suspicious.slice(0, 10).map((o) => [`${o.base}/${o.quote}`, `${o.buyVenue} ${fmtPrice(o.buyPrice)}`, `${o.sellVenue} ${fmtPrice(o.sellPrice)}`, fmtBps(o.grossBps)]),
      ),
    );
  }

  if (r.errors.length) {
    lines.push(`## Fetch errors\n`);
    for (const e of r.errors) lines.push(`- ${e}`);
    lines.push("");
  }

  lines.push(
    "> Snapshot, not a trade: quotes are seconds old, fees assume base tier, and a cross-exchange edge only exists " +
      "when you already hold inventory on both venues. Withdraw/deposit status and symbol identity must be checked before acting.",
  );
  return lines.join("\n");
}

/** Compact one-screen text summary for terminals / chat. */
export function renderText(r: ScanResult, limit = 5): string {
  const out: string[] = [];
  out.push(`Arbitrage scan ${new Date(r.generatedAt).toISOString()}`);
  out.push(`cross-exchange: ${r.crossExchange.length}, triangular: ${r.triangular.length}, carry: ${r.basis.length}, funding-spread: ${r.fundingSpread.length}`);
  for (const o of r.crossExchange.slice(0, limit))
    out.push(`  ${o.base}/${o.quote}: buy ${o.buyVenue} ${fmtPrice(o.buyPrice)} → sell ${o.sellVenue} ${fmtPrice(o.sellPrice)}  net ${fmtBps(o.netBps)}  max ${fmtMoney(o.maxNotionalQuote)}`);
  for (const o of r.triangular.slice(0, limit)) out.push(`  ${o.venue}: ${o.path.join("→")}  net ${fmtBps(o.netBps)}`);
  for (const o of r.basis.slice(0, limit)) out.push(`  ${o.base}: ${o.direction} ${o.spotVenue}/${o.perpVenue}  net APR ${fmtPct(o.netAprPct)}`);
  if (r.errors.length) out.push(`errors: ${r.errors.length}`);
  return out.join("\n");
}
