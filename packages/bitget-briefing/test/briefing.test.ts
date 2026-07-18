import { describe, expect, it } from "vitest";
import {
  buildBriefing,
  classify,
  classifyAll,
  discoverTelegramChatId,
  fetchAnnouncements,
  notifyAll,
  parseAnnouncementCenterHtml,
  parseApiResponse,
  renderMarkdown,
  renderText,
  sampleAnnouncements,
  type Announcement,
  type FetchLike,
} from "../src/index.js";

const NOW = 1_800_000_000_000; // fixed "now" for deterministic tests

function ann(over: Partial<Announcement>): Announcement {
  return {
    id: "1",
    title: "t",
    url: "https://www.bitget.com/support/articles/1",
    section: "latest_news",
    publishedAt: NOW - 1000,
    ...over,
  };
}

describe("classify", () => {
  it("flags delistings as critical even from a generic section", () => {
    const c = classify(ann({ title: "Notice on the Delisting of XYZ/USDT" }));
    expect(c.severity).toBe("critical");
    expect(c.reasons).toContain("delisting");
  });

  it("flags suspension / maintenance / security keywords as critical", () => {
    for (const title of [
      "ABC deposits and withdrawals suspended during upgrade",
      "Scheduled system maintenance on July 14",
      "Security incident notice regarding phishing sites",
      "XYZ token swap and contract migration",
      "Adjustment of leverage and funding rate for DEFUSDT",
    ]) {
      expect(classify(ann({ title })).severity).toBe("critical");
    }
  });

  it("uses section baseline: delisting/maintenance/security sections are critical", () => {
    expect(classify(ann({ title: "anything", section: "symbol_delisting" })).severity).toBe("critical");
    expect(classify(ann({ title: "anything", section: "maintenance_system_updates" })).severity).toBe("critical");
    expect(classify(ann({ title: "anything", section: "security" })).severity).toBe("critical");
  });

  it("classifies listings and API changes as notable, promos as info", () => {
    expect(classify(ann({ title: "Bitget Will List NewCoin (NEW)", section: "coin_listings" })).severity).toBe("notable");
    expect(classify(ann({ title: "WebSocket endpoint changes", section: "api_trading" })).severity).toBe("notable");
    expect(classify(ann({ title: "Trade to share a prize pool!", section: "trading_competitions_promotions" })).severity).toBe("info");
  });

  it("does not let 'delist' leak into plain listings", () => {
    const c = classify(ann({ title: "Bitget lists ABC in the Innovation Zone", section: "coin_listings" }));
    expect(c.severity).toBe("notable");
  });
});

describe("buildBriefing", () => {
  it("filters to the window, keeps unknown timestamps, and buckets by severity", () => {
    const classified = classifyAll(sampleAnnouncements(NOW));
    classified.push(classify(ann({ id: "n", title: "Delisting with no timestamp", publishedAt: null })));
    const b = buildBriefing(classified, { windowHours: 24, now: NOW });

    expect(b.critical.map((a) => a.id).sort()).toEqual(["1001", "1002", "1003", "n"]);
    // 1007 (Launchpool) is a promo by section but upgraded to notable by keyword
    expect(b.notable.map((a) => a.id).sort()).toEqual(["1004", "1005", "1007"]);
    expect(b.info.map((a) => a.id).sort()).toEqual(["1006"]);
    // the 72h-old item is dropped
    expect([...b.critical, ...b.notable, ...b.info].some((a) => a.id === "1000")).toBe(false);
  });

  it("renders markdown and text with counts and links", () => {
    const b = buildBriefing(classifyAll(sampleAnnouncements(NOW)), { windowHours: 24, now: NOW });
    const md = renderMarkdown(b);
    expect(md).toContain("3 critical · 3 notable · 1 FYI");
    expect(md).toContain("[Notice on the Delisting of XYZ/USDT Spot Trading Pair](https://www.bitget.com/support/articles/1001)");
    expect(md).toContain("## 🔴 Critical");
    const text = renderText(b);
    expect(text).toContain("🔴 CRITICAL:");
    expect(text).toContain("Notice on the Delisting");
  });

  it("celebrates when there is nothing critical", () => {
    const md = renderMarkdown(buildBriefing([], { now: NOW }));
    expect(md).toContain("_No critical announcements. 🎉_");
  });
});

describe("parseApiResponse", () => {
  it("maps rows and skips junk", () => {
    const body = JSON.stringify({
      code: "00000",
      msg: "success",
      data: [
        { annId: "42", annTitle: "Hello", annDesc: "World", annUrl: "https://x/support/articles/42", cTime: String(NOW) },
        { annTitle: "" }, // no title -> skipped
        "garbage",
      ],
    });
    const anns = parseApiResponse(body, "coin_listings");
    expect(anns).toHaveLength(1);
    expect(anns[0]).toMatchObject({ id: "42", title: "Hello", section: "coin_listings", publishedAt: NOW });
  });

  it("throws on API error codes", () => {
    expect(() => parseApiResponse(JSON.stringify({ code: "40001", msg: "bad" }), "security")).toThrow(/40001/);
  });
});

describe("parseAnnouncementCenterHtml", () => {
  it("extracts article links and titles, de-duplicated", () => {
    const html = `
      <a href="/asia/support/articles/123" class="x"><span>Delisting of <b>ABC</b></span></a>
      <a href="https://www.bitget.com/asia/support/articles/456">New listing&#x27;s here</a>
      <a href="/asia/support/articles/123">Delisting of ABC (dupe)</a>
      <a href="/asia/support/other/999">not an article</a>`;
    const anns = parseAnnouncementCenterHtml(html);
    expect(anns).toHaveLength(2);
    expect(anns[0]).toMatchObject({ id: "123", title: "Delisting of ABC", publishedAt: null });
    expect(anns[0].url).toBe("https://www.bitget.com/asia/support/articles/123");
    expect(anns[1].title).toBe("New listing's here");
  });
});

describe("telegram rendering", () => {
  const mk = (id: string, title: string, publishedAt: number): Announcement => ({
    id,
    title,
    url: `https://www.bitget.com/en/support/articles/${id}`,
    section: "maintenance_system_updates",
    publishedAt,
  });

  it("pairs suspend→resume about the same subject into one resolved entry", async () => {
    const { pairSuspendResume } = await import("../src/telegram.js");
    const items = classifyAll([
      mk("1", "Bitget announcement on suspending USDC - APTOS network withdrawal service", NOW - 8 * 3_600_000),
      mk("2", "Bitget announcement on resuming USDC - APTOS withdrawals", NOW - 1 * 3_600_000),
      mk("3", "Bitget announcement on suspending HOME - BASE network withdrawal service", NOW - 5 * 3_600_000),
    ]);
    const paired = pairSuspendResume(items);
    expect(paired).toHaveLength(2);
    expect(paired[0].kind).toBe("single"); // HOME still down, first
    expect(paired[0].item.id).toBe("3");
    expect(paired[1].kind).toBe("resolved");
    expect(paired[1].item.id).toBe("2");
    expect(paired[1].counterpart?.id).toBe("1");
  });

  it("renders HTML with glyphs, linked titles, no raw URLs in text", async () => {
    const { renderTelegramHtml } = await import("../src/telegram.js");
    const b = buildBriefing(
      classifyAll([
        mk("1", "Bitget announcement on suspending HOME - BASE network withdrawal service", NOW - 5 * 3_600_000),
        mk("2", "Notice of <Special> & Maintenance", NOW - 2 * 3_600_000),
      ]),
      { windowHours: 24, now: NOW },
    );
    const html = renderTelegramHtml(b, { historyUrl: "https://github.com/x/y/blob/z/briefings/latest.md" });
    expect(html).toContain("<b>Bitget Daily Briefing</b>");
    expect(html).toContain('⏸ <a href="https://www.bitget.com/en/support/articles/1">');
    expect(html).toContain("&lt;Special&gt; &amp; Maintenance"); // escaped
    expect(html).toContain("🚨 <b>Needs attention</b>");
    expect(html).toContain("📚 Briefing history");
    expect(html).not.toMatch(/[^"]https:\/\/www\.bitget\.com/); // links only inside href attrs
  });

  it("files a lone resumption under resolved, not needs-attention", async () => {
    const { pairSuspendResume, renderTelegramHtml } = await import("../src/telegram.js");
    const items = classifyAll([
      mk("1", "Bitget announcement on resuming MANTRA - Mantra deposits and withdrawals", NOW - 2 * 3_600_000),
      mk("2", "Bitget announcement on suspending HOME - BASE network withdrawal service", NOW - 5 * 3_600_000),
    ]);
    const paired = pairSuspendResume(items);
    expect(paired[0].item.id).toBe("2"); // active problem first
    expect(paired[1].kind).toBe("resolved");
    expect(paired[1].counterpart).toBeUndefined();
    const html = renderTelegramHtml(buildBriefing(items, { windowHours: 24, now: NOW }));
    const attention = html.slice(html.indexOf("Needs attention"), html.indexOf("Resolved"));
    expect(attention).not.toContain("MANTRA");
    expect(html.slice(html.indexOf("Resolved"))).toContain("MANTRA");
  });

  it("compact mode omits the header the photo caption already carries", async () => {
    const { renderTelegramHtml } = await import("../src/telegram.js");
    const b = buildBriefing(classifyAll(sampleAnnouncements(NOW)), { windowHours: 24, now: NOW });
    const compact = renderTelegramHtml(b, { compact: true });
    expect(compact).not.toContain("Bitget Daily Briefing");
    expect(compact).toContain("Needs attention");
  });

  it("sends the compact body only when the photo actually delivered", async () => {
    const bodies: string[] = [];
    const mkFetch = (photoOk: boolean): FetchLike => async (url, init) => {
      if (url.includes("sendPhoto")) return { ok: photoOk, status: photoOk ? 200 : 500, text: async () => "{}" };
      if (url.includes("sendMessage")) bodies.push(JSON.parse(init!.body!).text);
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const content = {
      text: "t",
      telegramHtml: "FULL",
      telegramHtmlCompact: "COMPACT",
      telegramPhoto: { url: "https://quickchart.io/chart?c=x" },
    };
    await notifyAll(content, { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "9" }, mkFetch(true));
    await notifyAll(content, { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "9" }, mkFetch(false));
    expect(bodies).toEqual(["COMPACT", "FULL"]);
  });

  it("condenses boilerplate titles and celebrates quiet days", async () => {
    const { condenseTitle, renderTelegramHtml } = await import("../src/telegram.js");
    expect(condenseTitle("Bitget announcement on resuming USDC - APTOS withdrawals")).toBe(
      "Resuming USDC - APTOS withdrawals",
    );
    expect(condenseTitle("Notice of Suspension for TON Deposit and Withdrawal")).toBe(
      "Suspension for TON Deposit and Withdrawal",
    );
    const html = renderTelegramHtml(buildBriefing([], { now: NOW }));
    expect(html).toContain("Nothing critical today");
  });

  it("stays under Telegram's message limit with many items", async () => {
    const { renderTelegramHtml } = await import("../src/telegram.js");
    const many = classifyAll(
      Array.from({ length: 60 }, (_, i) =>
        mk(String(i), `Bitget announcement on suspending COIN${i} - CHAIN${i} network withdrawal service with a fairly long title padding ${"x".repeat(40)}`, NOW - i * 60_000),
      ),
    );
    const html = renderTelegramHtml(buildBriefing(many, { windowHours: 24, now: NOW }));
    expect(html.length).toBeLessThanOrEqual(4096);
    expect(html).toContain("more</i>");
  });
});

describe("summary chart & photo delivery", () => {
  it("builds a QuickChart URL embedding the severity counts", async () => {
    const { buildSummaryChartUrl, renderTelegramCaption } = await import("../src/telegram.js");
    const b = buildBriefing(classifyAll(sampleAnnouncements(NOW)), { windowHours: 24, now: NOW });
    const url = buildSummaryChartUrl(b);
    expect(url).toMatch(/^https:\/\/quickchart\.io\/chart\?/);
    expect(new URL(url).searchParams.get("version")).toBe("3");
    const cfg = JSON.parse(new URL(url).searchParams.get("c")!);
    expect(cfg.data.datasets[0].data).toEqual([3, 3, 1]);
    // plain-text labels: emoji render badly in the chart rasterizer
    expect(cfg.data.labels).toEqual(["Critical", "Notable", "Promos"]);
    // headroom so the largest bar's count label is never clipped
    expect(cfg.options.scales.x.suggestedMax).toBe(4);
    const caption = renderTelegramCaption(b);
    expect(caption).toContain("<b>3 critical</b>");
  });

  it("sends the photo before the message; a photo failure is non-fatal", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes("sendPhoto")) {
        return { ok: false, status: 500, text: async () => "quickchart down" };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const errors = await notifyAll(
      { text: "t", telegramHtml: "<b>t</b>", telegramPhoto: { url: "https://quickchart.io/chart?c=x", caption: "cap" } },
      { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "99" },
      fetchFn,
    );
    expect(errors).toEqual([]); // message still delivered
    expect(calls.findIndex((u) => u.includes("sendPhoto"))).toBeLessThan(
      calls.findIndex((u) => u.includes("sendMessage")),
    );
  });
});

describe("article reasons", () => {
  it("classifies causes and extracts the explanatory sentence", async () => {
    const { findReason } = await import("../src/article.js");
    const upgrade = findReason(
      "Dear Bitget users. To support the Klever network upgrade, Bitget will suspend KLV deposit and withdrawal services on July 18. Trading is not affected. Thank you for your support.",
    );
    expect(upgrade).toMatchObject({ cause: "network-upgrade" });
    expect(upgrade!.excerpt).toContain("Klever network upgrade");

    const hack = findReason(
      "Due to a security incident affecting the HOME bridge contract, deposits and withdrawals are suspended until further notice. Funds on Bitget remain safe.",
    );
    expect(hack).toMatchObject({ cause: "security" });
    expect(hack!.excerpt).toContain("security incident");

    const generic = findReason("We will list a new token soon. Trading opens tomorrow at noon exactly.");
    expect(generic).toBeNull();

    // page chrome must never be quoted, even when it contains cause keywords
    const chromey = findReason(
      "Bitget announcement on suspending KLV | Bitget Support Center Bitget App Trade smarter Buy crypto Markets Trade Futures Earn Square More maintenance something. " +
        "To support the Klever network upgrade, Bitget will suspend KLV deposits. Thank you for your patience today.",
    );
    expect(chromey!.excerpt).toBe("To support the Klever network upgrade, Bitget will suspend KLV deposits.");
    const onlyChrome = findReason(
      "Suspending KLV | Bitget Support Center Bitget App Trade smarter Buy crypto Markets maintenance window something else here.",
    );
    expect(onlyChrome).toBeNull();

    // resumption articles that state only the fact still yield an excerpt
    const resumed = findReason(
      "Deposit and withdrawal services for MANTRA have now resumed on Bitget. Thank you for your patience and continued support.",
    );
    expect(resumed!.excerpt).toContain("have now resumed");
  });

  it("extracts the real Bitget resume-article body (captured from production)", async () => {
    const { findReason } = await import("../src/article.js");
    // Verbatim shape of the live page's text (no __NEXT_DATA__, nav has no periods)
    const real =
      "Bitget announcement on resuming USDC - APTOS withdrawals | Bitget Support Center Bitget App Trade smarter Buy crypto Markets Trade Futures Earn Square More Bitget / Help Center / Maintenance or system updates / Asset maintenance / Bitget announcement on resuming USDC - APTOS withdrawals / Maintenance or system updates Latest news New listings Product updates Competitions and promotions Delisting information Security Institutional Services API trading Fiat Maintenance or system updates Asset maintenance System updates Spot maintenance Futures maintenance Bitget announcement on resuming USDC - APTOS withdrawals 2026-07-18 09:14 3 818 Dear users: Bitget has now opened the withdrawal service on the USDC - APTOS network. We sincerely apologize for any inconvenience caused during the suspension and thank you for your understanding. Thank you for your support of Bitget!";
    const { extractArticleText } = await import("../src/article.js");
    const reason = findReason(extractArticleText(`<html><body>${real}</body></html>`));
    expect(reason!.excerpt).toBe(
      "Bitget has now opened the withdrawal service on the USDC - APTOS network.",
    );
  });

  it("cuts 'has resumed' bodies out of the chrome blob", async () => {
    const { extractArticleText, findReason } = await import("../src/article.js");
    const html =
      "<html><body><nav>Resuming USDC withdrawals Bitget Support Center Bitget App Trade smarter Buy crypto Markets Trade Futures Earn Square More lots of nav text without periods</nav>" +
      "<p>Bitget has resumed the withdrawal function of the USDC - APTOS network. Thank you all for your patience.</p></body></html>";
    const reason = findReason(extractArticleText(html));
    expect(reason!.excerpt).toBe("Bitget has resumed the withdrawal function of the USDC - APTOS network.");
  });

  it("extracts article text from __NEXT_DATA__ pages and attaches reasons", async () => {
    const { attachReasons, extractArticleText } = await import("../src/article.js");
    const body =
      "<p>To support the <b>Aptos network upgrade</b>, Bitget will suspend USDC deposits. Withdrawals resume once the network is stable. Thanks for understanding and support.</p>";
    const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { article: { content: body, title: "t" } } },
    })}</script></head><body><div>chrome</div></body></html>`;
    expect(extractArticleText(html)).toContain("Aptos network upgrade");

    const anns = classifyAll([
      ann({ id: "1", title: "Suspending USDC - APTOS", section: "maintenance_system_updates", url: "https://x/a" }),
    ]);
    const fetchFn: FetchLike = async () => ({ ok: true, status: 200, text: async () => html });
    await attachReasons(anns, fetchFn);
    expect(anns[0].reason).toMatchObject({ cause: "network-upgrade" });
  });

  it("renders the why-line and the security flag in telegram output", async () => {
    const { renderTelegramHtml } = await import("../src/telegram.js");
    const anns = classifyAll([
      ann({ id: "1", title: "Suspending HOME - BASE network withdrawal service", section: "maintenance_system_updates" }),
    ]);
    anns[0].reason = { cause: "security", excerpt: "Due to a security incident affecting the HOME bridge contract." };
    const html = renderTelegramHtml(buildBriefing(anns, { windowHours: 24, now: NOW }));
    expect(html).toContain("ℹ️ <i>Due to a security incident");
    expect(html).toContain("🛡 <b>Security-related — treat as elevated risk</b>");
  });
});

describe("trade angles", () => {
  it("derives prioritized signals with extracted assets", async () => {
    const { deriveSignals, extractAsset } = await import("../src/signals.js");
    expect(extractAsset("Bitget announcement on resuming USDC - APTOS withdrawals")).toBe("USDC (APTOS)");
    expect(extractAsset("Bitget Will List NewCoin (NEW) in the Innovation Zone")).toBe("NEW");
    expect(extractAsset("Notice on the Delisting of XYZ/USDT Spot Trading Pair")).toBe("XYZ/USDT");
    expect(extractAsset("Bitget to adjust funding rate interval for 1000XECUSDT perpetual futures")).toBe("1000XECUSDT perp");

    const anns = classifyAll([
      ann({ id: "a", title: "Bitget Will List NewCoin (NEW) in the Innovation Zone", section: "coin_listings" }),
      ann({ id: "b", title: "Notice on the Delisting of XYZ/USDT Spot Trading Pair", section: "symbol_delisting" }),
      ann({ id: "c", title: "Bitget announcement on suspending VANA - Vana deposit and withdrawal services", section: "maintenance_system_updates" }),
    ]);
    const signals = deriveSignals(anns);
    expect(signals[0].stance).toBe("exit-risk"); // delisting outranks the rest
    expect(signals[0].asset).toBe("XYZ/USDT");
    expect(signals.map((s) => s.stance)).toContain("arb-watch");
    expect(signals.map((s) => s.stance)).toContain("avoid-chase");
  });

  it("computes research-anchored entry/TP/SL brackets per stance", async () => {
    const { deriveSignals, attachPriceLevels, computeLevels, formatLevels } = await import("../src/signals.js");
    const signals = deriveSignals(
      classifyAll([
        ann({ id: "d", title: "Notice on the Delisting of KLV/USDT Spot Trading Pair", section: "symbol_delisting" }),
        ann({ id: "r", title: "Bitget announcement on resuming OM - Mantra withdrawals", section: "maintenance_system_updates" }),
        ann({ id: "l", title: "Bitget Will List NewCoin (NEW) in the Innovation Zone", section: "coin_listings" }),
        ann({ id: "f", title: "Bitget announcement on suspending KAVA - Kava deposit services", section: "maintenance_system_updates" }),
      ]),
    );
    const prices = new Map([["KLVUSDT", 0.002], ["OMUSDT", 2.5], ["NEWUSDT", 1.0], ["KAVAUSDT", 0.5]]);
    const withLevels = attachPriceLevels(signals, prices);

    const delist = withLevels.find((s) => s.stance === "exit-risk")!;
    expect(delist.levels).toMatchObject({ side: "short", entry: 0.002, tp: 0.0014, sl: 0.00224 });
    const resume = withLevels.find((s) => /resum/i.test(s.source.title))!;
    expect(resume.levels).toMatchObject({ side: "short", entry: 2.5, tp: 2.375, sl: 2.6 });
    const listing = withLevels.find((s) => s.stance === "avoid-chase")!;
    expect(listing.levels).toMatchObject({ side: "long", entry: 0.85, tp: 1.0, sl: 0.765 });
    // frozen transfers: watch only, no levels
    const frozen = withLevels.find((s) => /suspending KAVA/i.test(s.source.title))!;
    expect(frozen.levels).toBeUndefined();
    // stablecoins never get levels
    expect(computeLevels({ ...delist, coin: undefined }, 1)).toBeDefined(); // levels are stance-based
    expect(formatLevels(delist.levels!)).toBe("Short @ 0.002 · TP 0.0014 (−30%) · SL 0.00224 (+12%)");
  });

  it("parses the Bitget spot tickers response", async () => {
    const { fetchSpotPrices } = await import("../src/prices.js");
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ code: "00000", data: [{ symbol: "KLVUSDT", lastPr: "0.002" }, { symbol: "BAD" }, {}] }),
    });
    const prices = await fetchSpotPrices(fetchFn);
    expect(prices.get("KLVUSDT")).toBe(0.002);
    expect(prices.size).toBe(1);
    const failing: FetchLike = async () => ({ ok: false, status: 403, text: async () => "" });
    expect((await fetchSpotPrices(failing)).size).toBe(0);
  });

  it("renders trade angles in telegram and markdown with a disclaimer", async () => {
    const { renderTelegramHtml } = await import("../src/telegram.js");
    const b = buildBriefing(
      classifyAll([ann({ id: "b", title: "Notice on the Delisting of XYZ/USDT Spot Trading Pair", section: "symbol_delisting" })]),
      { windowHours: 24, now: NOW },
    );
    expect(b.signals).toHaveLength(1);
    const html = renderTelegramHtml(b);
    expect(html).toContain("💡 <b>Trade angles</b>");
    expect(html).toContain("<b>XYZ/USDT</b>");
    expect(html).toContain("not financial advice");
    const md = renderMarkdown(b);
    expect(md).toContain("## 💡 Trade angles");
    expect(md).toContain("not financial advice");
  });
});

describe("7-day trend", () => {
  it("parses TL;DR counts and builds a 7-day series with gaps and today's override", async () => {
    const { parseTldr, buildTrendSeries } = await import("../src/history.js");
    expect(parseTldr("x\n**TL;DR:** 7 critical · 1 notable · 0 FYI\ny")).toEqual({
      critical: 7,
      notable: 1,
      info: 0,
    });
    const dayMs = 86_400_000;
    const iso = (i: number) => new Date(NOW - i * dayMs).toISOString().slice(0, 10);
    const history = [
      { date: iso(4), critical: 7, notable: 1, info: 0 },
      { date: iso(0), critical: 99, notable: 0, info: 0 }, // stale today's file
    ];
    const t = buildTrendSeries(history, NOW, { critical: 4, notable: 0, info: 0 });
    expect(t.labels).toHaveLength(7);
    expect(t.daysWithData).toBe(2);
    expect(t.critical[2]).toBe(7); // 4 days ago
    expect(t.critical[6]).toBe(4); // today: live counts win over the file
    expect(t.critical[5]).toBeNull(); // gap day
  });

  it("uses the trend line chart when history exists, bars on day one", async () => {
    const { buildSummaryChartUrl } = await import("../src/telegram.js");
    const { buildTrendSeries } = await import("../src/history.js");
    const b = buildBriefing(classifyAll(sampleAnnouncements(NOW)), { windowHours: 24, now: NOW });
    const iso = (i: number) => new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
    const trend = buildTrendSeries([{ date: iso(3), critical: 2, notable: 1, info: 0 }], NOW, {
      critical: 3,
      notable: 3,
      info: 1,
    });
    const cfg = JSON.parse(new URL(buildSummaryChartUrl(b, trend)).searchParams.get("c")!);
    expect(cfg.type).toBe("line");
    expect(cfg.data.labels).toHaveLength(7);
    expect(cfg.data.datasets[0].label).toBe("Critical");
    expect(cfg.data.datasets[0].data[6]).toBe(3);
    expect(cfg.options.plugins.title.text[1]).toContain("7-day trend");

    const dayOne = buildTrendSeries([], NOW, { critical: 3, notable: 3, info: 1 });
    const barCfg = JSON.parse(new URL(buildSummaryChartUrl(b, dayOne)).searchParams.get("c")!);
    expect(barCfg.type).toBe("bar"); // not enough history yet
  });

  it("loads history from disk, ignoring latest.md and junk", async () => {
    const { loadHistory } = await import("../src/history.js");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "briefings-"));
    writeFileSync(join(dir, "2026-07-14.md"), "**TL;DR:** 7 critical · 1 notable · 0 FYI");
    writeFileSync(join(dir, "2026-07-18.md"), "**TL;DR:** 4 critical · 0 notable · 0 FYI");
    writeFileSync(join(dir, "latest.md"), "**TL;DR:** 4 critical · 0 notable · 0 FYI");
    writeFileSync(join(dir, "telegram-chat-id.txt"), "226763300");
    const h = loadHistory(dir);
    expect(h).toEqual([
      { date: "2026-07-14", critical: 7, notable: 1, info: 0 },
      { date: "2026-07-18", critical: 4, notable: 0, info: 0 },
    ]);
    expect(loadHistory(join(dir, "missing"))).toEqual([]);
  });
});

describe("fetchAnnouncements", () => {
  const apiOk = (rows: unknown[]): string => JSON.stringify({ code: "00000", data: rows });

  it("merges sections, prefers specific sections over latest_news, reports per-section errors", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("annType=symbol_delisting")) {
        return { ok: true, status: 200, text: async () => apiOk([{ annId: "1", annTitle: "Delist ABC", annUrl: "u", cTime: String(NOW) }]) };
      }
      if (url.includes("annType=latest_news")) {
        return { ok: true, status: 200, text: async () => apiOk([
          { annId: "1", annTitle: "Delist ABC", annUrl: "u", cTime: String(NOW) },
          { annId: "2", annTitle: "Other news", annUrl: "u2", cTime: String(NOW - 1) },
        ]) };
      }
      return { ok: false, status: 500, text: async () => "boom" };
    };
    const { announcements, errors } = await fetchAnnouncements({ fetchFn });
    expect(announcements).toHaveLength(2);
    expect(announcements.find((a) => a.id === "1")?.section).toBe("symbol_delisting");
    expect(errors.length).toBe(6); // the other six sections failed
  });

  it("falls back to HTML scraping when the API is fully unreachable", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("announcement-center")) {
        return { ok: true, status: 200, text: async () => '<a href="/asia/support/articles/7">Fallback title</a>' };
      }
      return { ok: false, status: 403, text: async () => "" };
    };
    const { announcements, errors } = await fetchAnnouncements({ fetchFn });
    expect(announcements).toHaveLength(1);
    expect(announcements[0].title).toBe("Fallback title");
    expect(errors.some((e) => e.includes("HTML fallback"))).toBe(true);
  });

  it("discovers the telegram chat id from the latest update", async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          result: [
            { message: { chat: { id: 111 } } },
            { message: { chat: { id: 222 } } },
            { edited_message: {} },
          ],
        }),
    });
    expect(await discoverTelegramChatId("tok", fetchFn)).toBe("222");
  });

  it("notifyAll sends to telegram with auto-discovered chat id and pin tip", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, body: init?.body });
      if (url.includes("getUpdates")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: [{ message: { chat: { id: 42 } } }] }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const errors = await notifyAll("hello", { TELEGRAM_BOT_TOKEN: "tok" }, fetchFn);
    expect(errors).toEqual([]);
    const send = calls.find((c) => c.url.includes("sendMessage"));
    const payload = JSON.parse(send!.body!);
    expect(payload.chat_id).toBe("42");
    expect(payload.text).toContain("hello");
    expect(payload.text).toContain("TELEGRAM_CHAT_ID=42");
  });

  it("notifyAll reports a helpful error when nobody has messaged the bot", async () => {
    const fetchFn: FetchLike = async (url) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: [] }),
    });
    const errors = await notifyAll("hi", { TELEGRAM_BOT_TOKEN: "tok" }, fetchFn);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("press Start");
  });

  it("notifyAll uses a pinned TELEGRAM_CHAT_ID without discovery", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const errors = await notifyAll("hi", { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "99" }, fetchFn);
    expect(errors).toEqual([]);
    expect(calls.some((u) => u.includes("getUpdates"))).toBe(false);
  });

  it("retries the alternate API spelling on 404", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/annoucements")) return { ok: false, status: 404, text: async () => "" };
      return { ok: true, status: 200, text: async () => apiOk([{ annId: "9", annTitle: "T", annUrl: "u", cTime: String(NOW) }]) };
    };
    const { announcements } = await fetchAnnouncements({ fetchFn, sections: ["latest_news"] });
    expect(announcements).toHaveLength(1);
  });
});
