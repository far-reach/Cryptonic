import type { FetchLike } from "./types.js";

export interface NotifyEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

async function post(fetchFn: FetchLike, url: string, body: unknown): Promise<void> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Deliver the briefing text to every channel configured via env vars.
 * Returns a list of "channel: error" strings for channels that failed;
 * channels that aren't configured are skipped silently.
 */
export async function notifyAll(
  text: string,
  env: NotifyEnv = process.env as NotifyEnv,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<string[]> {
  const errors: string[] = [];
  const attempts: Array<[string, () => Promise<void>]> = [];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    attempts.push([
      "telegram",
      () =>
        post(fetchFn, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
    ]);
  }
  if (env.SLACK_WEBHOOK_URL) {
    attempts.push(["slack", () => post(fetchFn, env.SLACK_WEBHOOK_URL!, { text })]);
  }
  if (env.DISCORD_WEBHOOK_URL) {
    // Discord caps message content at 2000 chars.
    attempts.push([
      "discord",
      () => post(fetchFn, env.DISCORD_WEBHOOK_URL!, { content: text.slice(0, 2000) }),
    ]);
  }

  for (const [name, run] of attempts) {
    try {
      await run();
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return errors;
}
