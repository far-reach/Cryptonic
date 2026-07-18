import type { FetchLike } from "./types.js";

export interface NotifyEnv {
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional — when unset, the chat is auto-discovered from the bot's latest update. */
  TELEGRAM_CHAT_ID?: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

async function post(fetchFn: FetchLike, url: string, body: unknown): Promise<unknown> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Find the chat to deliver to from the bot's recent updates (the person who most
 * recently messaged the bot). Telegram only retains updates for ~24h, so a
 * discovered id should be pinned via TELEGRAM_CHAT_ID for reliable daily delivery.
 */
export async function discoverTelegramChatId(
  token: string,
  fetchFn: FetchLike,
): Promise<string | null> {
  const res = await fetchFn(`https://api.telegram.org/bot${token}/getUpdates`, { method: "GET" });
  if (!res.ok) throw new Error(`getUpdates HTTP ${res.status}`);
  const json = JSON.parse(await res.text()) as {
    ok?: boolean;
    result?: Array<{ message?: { chat?: { id?: number } } }>;
  };
  if (!json.ok || !Array.isArray(json.result)) return null;
  for (let i = json.result.length - 1; i >= 0; i--) {
    const id = json.result[i]?.message?.chat?.id;
    if (id !== undefined) return String(id);
  }
  return null;
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

  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      let chatId = env.TELEGRAM_CHAT_ID;
      let body = text;
      if (!chatId) {
        const discovered = await discoverTelegramChatId(env.TELEGRAM_BOT_TOKEN, fetchFn);
        if (!discovered) {
          throw new Error(
            "no chat found — open your bot in Telegram, press Start / send it any message, then retry within 24h (or set TELEGRAM_CHAT_ID)",
          );
        }
        chatId = discovered;
        body +=
          `\n\n🛠 Delivered via auto-discovered chat id ${chatId}. ` +
          `Add TELEGRAM_CHAT_ID=${chatId} as a secret to make delivery permanent ` +
          `(auto-discovery stops working ~24h after your last message to the bot).`;
      }
      await post(fetchFn, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true,
      });
    } catch (err) {
      errors.push(`telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (env.SLACK_WEBHOOK_URL) {
    try {
      await post(fetchFn, env.SLACK_WEBHOOK_URL, { text });
    } catch (err) {
      errors.push(`slack: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (env.DISCORD_WEBHOOK_URL) {
    try {
      // Discord caps message content at 2000 chars.
      await post(fetchFn, env.DISCORD_WEBHOOK_URL, { content: text.slice(0, 2000) });
    } catch (err) {
      errors.push(`discord: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errors;
}
