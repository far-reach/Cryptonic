#!/usr/bin/env node
/**
 * Bitget daily-briefing bot.
 *
 * Reads the Bitget announcement center (public API, HTML fallback), classifies each
 * announcement by how much you should care, and prints a markdown briefing.
 *
 * Env:
 *   BRIEFING_WINDOW_HOURS  look-back window (default 24)
 *   BRIEFING_LANGUAGE      Bitget language code (default en_US)
 *   BRIEFING_OUTPUT        also write the markdown briefing to this file
 *   GITHUB_STEP_SUMMARY    (set by GitHub Actions) briefing is appended automatically
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / SLACK_WEBHOOK_URL / DISCORD_WEBHOOK_URL
 *                          optional delivery channels
 *   BRIEFING_LICENSE_KEY   Pro/Desk license key (unset = free plan; see docs/pricing.md)
 *   BRIEFING_NO_UPSELL     drop the free tier's footer line
 *
 * Flags:
 *   --demo                 render from bundled sample data (no network)
 *   --critical-only        exit 0 and print nothing unless there are critical items
 *   --weekly               Sunday weekly review (Pro)
 *   --plan                 print the active plan, license state & entitlements
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fetchAnnouncements } from "./fetch.js";
import { classifyAll } from "./classify.js";
import { buildBriefing, renderMarkdown, renderText } from "./briefing.js";
import { discoverTelegramChatId, notifyAll } from "./notify.js";
import { buildSummaryChartUrl, renderTelegramCaption, renderTelegramHtml } from "./telegram.js";
import { buildTrendSeries, loadHistory } from "./history.js";
import { attachPriceLevels } from "./signals.js";
import { fetchSpotPrices } from "./prices.js";
import { attachReasons } from "./article.js";
import { renderWeeklyCaption, renderWeeklyMarkdown, renderWeeklyTelegramHtml } from "./weekly.js";
import { existsSync } from "node:fs";
import { sampleAnnouncements } from "./sample-data.js";
import type { FetchLike } from "./types.js";
import {
  can,
  clampWindowHours,
  formatPlanStatus,
  resolveSubscription,
  selectChannels,
  upsellFooter,
  type SubscriptionEnv,
} from "./subscription.js";

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const demo = args.has("--demo");
  const criticalOnly = args.has("--critical-only");

  // Freemium plan resolution (docs/pricing.md). Licensing never blocks the
  // briefing — any problem resolves to the free tier with a stderr note.
  const sub = resolveSubscription();
  if (args.has("--plan")) {
    console.log(formatPlanStatus(sub));
    return 0;
  }
  let flushed = 0;
  const flushNotices = () => {
    for (; flushed < sub.notices.length; flushed++) console.error(`plan: ${sub.notices[flushed]}`);
  };

  let weekly = args.has("--weekly") || process.env.BRIEFING_MODE === "weekly";
  if (weekly && !can(sub, "weekly-review")) {
    sub.notices.push("the weekly review is a Pro feature — running the daily briefing instead");
    weekly = false;
  }
  const requestedWindow = Number(process.env.BRIEFING_WINDOW_HOURS) || (weekly ? 168 : 24);
  const clamped = clampWindowHours(sub, requestedWindow);
  if (clamped.notice) sub.notices.push(clamped.notice);
  const windowHours = clamped.hours;
  flushNotices();
  const now = Date.now();

  let announcements;
  let fetchErrors: string[] = [];
  if (demo) {
    announcements = sampleAnnouncements(now);
  } else {
    const result = await fetchAnnouncements({
      language: process.env.BRIEFING_LANGUAGE || "en_US",
      startTime: now - windowHours * 3_600_000,
      endTime: now,
    });
    announcements = result.announcements;
    fetchErrors = result.errors;
    if (announcements.length === 0 && fetchErrors.length > 0) {
      console.error("Failed to fetch any announcements:\n  " + fetchErrors.join("\n  "));
      return 1;
    }
  }

  const briefing = buildBriefing(classifyAll(announcements), { windowHours, now, fetchErrors });

  // Live prices turn signals into concrete entry/TP/SL brackets (best-effort).
  // Price brackets are a Pro feature; the free tier keeps the angles themselves.
  if (!demo && can(sub, "price-levels") && briefing.signals.some((s) => s.coin)) {
    briefing.signals = attachPriceLevels(briefing.signals, await fetchSpotPrices());
  }

  // Fetch article bodies for critical items and attach the "why" (best-effort).
  if (!demo) {
    await attachReasons(briefing.critical, fetch as unknown as FetchLike, weekly ? 14 : 8);
  }

  if (criticalOnly && briefing.critical.length === 0) {
    console.error("No critical announcements in the window; staying quiet (--critical-only).");
    return 0;
  }

  const markdown =
    (weekly ? renderWeeklyMarkdown(briefing) : renderMarkdown(briefing)) +
    upsellFooter(sub, process.env as SubscriptionEnv);
  console.log(markdown);

  if (process.env.BRIEFING_OUTPUT) writeFileSync(process.env.BRIEFING_OUTPUT, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  // 7-day trend from the committed briefing history (repo root ./briefings;
  // ../../briefings covers running from within the package directory).
  const briefingsDir =
    process.env.BRIEFINGS_DIR ??
    (existsSync("briefings") ? "briefings" : existsSync("../../briefings") ? "../../briefings" : undefined);
  // In weekly mode the briefing counts span 7 days — for the chart's "today"
  // point, prefer the committed daily file so the trend stays a daily series.
  // The 7-day trend is a Pro feature; the free tier charts today's counts.
  const history = briefingsDir && can(sub, "trend-chart") ? loadHistory(briefingsDir) : [];
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const todayFromHistory = history.find((h) => h.date === todayIso);
  const todayCounts =
    weekly && todayFromHistory
      ? todayFromHistory
      : { critical: briefing.critical.length, notable: briefing.notable.length, info: briefing.info.length };
  const trend = buildTrendSeries(history, now, todayCounts);

  const historyUrl = process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_REF_NAME ?? "main"}/briefings/latest.md`
    : undefined;
  // Free tier: one delivery channel (Telegram → Slack → Discord); Pro: all.
  const channels = selectChannels(sub, process.env as SubscriptionEnv);
  if (channels.notice) sub.notices.push(channels.notice);
  flushNotices();
  const notifyErrors = await notifyAll(
    {
      text: renderText(briefing),
      telegramHtml: weekly
        ? renderWeeklyTelegramHtml(briefing, { historyUrl })
        : renderTelegramHtml(briefing, { historyUrl }),
      telegramHtmlCompact: weekly
        ? renderWeeklyTelegramHtml(briefing, { historyUrl, compact: true })
        : renderTelegramHtml(briefing, { historyUrl, compact: true }),
      telegramPhoto: {
        url: buildSummaryChartUrl(briefing, trend),
        caption: weekly ? renderWeeklyCaption(briefing) : renderTelegramCaption(briefing),
      },
    },
    channels.env,
  );

  // After a successful auto-discovered delivery, record the chat id so the
  // workflow can pin it (delivery then no longer depends on recent messages).
  if (process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_CHAT_ID && notifyErrors.length === 0) {
    try {
      const id = await discoverTelegramChatId(
        process.env.TELEGRAM_BOT_TOKEN,
        fetch as unknown as FetchLike,
      );
      if (id) {
        const dir = process.env.BRIEFING_OUTPUT ? dirname(process.env.BRIEFING_OUTPUT) : ".";
        writeFileSync(join(dir, "telegram-chat-id.txt"), id + "\n");
      }
    } catch {
      // best-effort; the next delivery will try again
    }
  }

  if (notifyErrors.length > 0) {
    for (const e of notifyErrors) console.error(`notify failed — ${e}`);
    // Record configured-channel failures where the workflow can pick them up;
    // don't fail here so the briefing itself still gets published.
    const dir = process.env.BRIEFING_OUTPUT ? dirname(process.env.BRIEFING_OUTPUT) : ".";
    writeFileSync(join(dir, "notify-errors.log"), notifyErrors.join("\n") + "\n");
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
