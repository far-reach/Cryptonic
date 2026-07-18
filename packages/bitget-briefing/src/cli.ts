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
 *
 * Flags:
 *   --demo                 render from bundled sample data (no network)
 *   --critical-only        exit 0 and print nothing unless there are critical items
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fetchAnnouncements } from "./fetch.js";
import { classifyAll } from "./classify.js";
import { buildBriefing, renderMarkdown, renderText } from "./briefing.js";
import { discoverTelegramChatId, notifyAll } from "./notify.js";
import { buildSummaryChartUrl, renderTelegramCaption, renderTelegramHtml } from "./telegram.js";
import { buildTrendSeries, loadHistory } from "./history.js";
import { existsSync } from "node:fs";
import { sampleAnnouncements } from "./sample-data.js";
import type { FetchLike } from "./types.js";

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const demo = args.has("--demo");
  const criticalOnly = args.has("--critical-only");
  const windowHours = Number(process.env.BRIEFING_WINDOW_HOURS) || 24;
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

  if (criticalOnly && briefing.critical.length === 0) {
    console.error("No critical announcements in the window; staying quiet (--critical-only).");
    return 0;
  }

  const markdown = renderMarkdown(briefing);
  console.log(markdown);

  if (process.env.BRIEFING_OUTPUT) writeFileSync(process.env.BRIEFING_OUTPUT, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  // 7-day trend from the committed briefing history (repo root ./briefings;
  // ../../briefings covers running from within the package directory).
  const briefingsDir =
    process.env.BRIEFINGS_DIR ??
    (existsSync("briefings") ? "briefings" : existsSync("../../briefings") ? "../../briefings" : undefined);
  const trend = buildTrendSeries(briefingsDir ? loadHistory(briefingsDir) : [], now, {
    critical: briefing.critical.length,
    notable: briefing.notable.length,
    info: briefing.info.length,
  });

  const historyUrl = process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_REF_NAME ?? "main"}/briefings/latest.md`
    : undefined;
  const notifyErrors = await notifyAll({
    text: renderText(briefing),
    telegramHtml: renderTelegramHtml(briefing, { historyUrl }),
    telegramHtmlCompact: renderTelegramHtml(briefing, { historyUrl, compact: true }),
    telegramPhoto: {
      url: buildSummaryChartUrl(briefing, trend),
      caption: renderTelegramCaption(briefing),
    },
  });

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
