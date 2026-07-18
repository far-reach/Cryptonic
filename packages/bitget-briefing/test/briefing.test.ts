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
