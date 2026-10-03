# @veil/bitget-briefing

A bot that reads the [Bitget announcement center](https://www.bitget.com/asia/support/announcement-center)
and produces a **critical daily briefing**: what can cost you money today (delistings,
deposit/withdrawal suspensions, maintenance, security notices, contract parameter changes)
first, new listings and API changes second, promos last.

## How it works

1. **Fetch** — queries Bitget's public announcements API
   (`GET /api/v2/public/annoucements`, no API key needed) across all sections:
   delistings, maintenance, security, listings, product updates, API trading, promos, news.
   If the API is unreachable it falls back to scraping the announcement-center HTML page.
2. **Classify** — each announcement gets a severity from its section baseline
   (delisting/maintenance/security sections are always critical) plus keyword rules
   (`delist`, `suspend`, `halt`, `token swap`, `funding rate adjustment`, …).
3. **Brief** — announcements from the last 24 h (configurable) are rendered as a markdown
   briefing: 🔴 critical / 🟡 notable / 🟢 FYI, and optionally pushed to Telegram, Slack,
   or Discord.

## Usage

```bash
# from the repo root
npm install --workspaces

# one-off briefing to stdout
npm run briefing

# preview the format without network access
npm run briefing -- --demo

# tests
npm test --workspace @veil/bitget-briefing
```

### Configuration (env vars)

| Var | Default | What |
|---|---|---|
| `BRIEFING_WINDOW_HOURS` | `24` | Look-back window. |
| `BRIEFING_LANGUAGE` | `en_US` | Bitget language code. |
| `BRIEFING_OUTPUT` | — | Also write the markdown briefing to this file. |
| `TELEGRAM_BOT_TOKEN` | — | Send the briefing to a Telegram chat (see below). |
| `TELEGRAM_CHAT_ID` | auto | Optional: pin the chat. Without it, the chat is auto-discovered from the bot's most recent incoming message (Telegram keeps updates ~24h, so pinning is recommended for daily delivery — the first delivered message tells you the id to pin). |
| `SLACK_WEBHOOK_URL` | — | Send to a Slack incoming webhook. |
| `DISCORD_WEBHOOK_URL` | — | Send to a Discord webhook. |

### Flags

- `--demo` — render from bundled sample data (no network needed).
- `--critical-only` — print nothing (and skip notifications) unless something critical
  happened; useful for alert-style scheduling.

### Telegram setup

1. In Telegram, talk to **@BotFather** → `/newbot` → copy the HTTP API token.
2. Open your new bot's chat and press **Start** (or send it any message) — bots can't
   message you first.
3. Add the token as the `TELEGRAM_BOT_TOKEN` GitHub Actions secret
   (repo → Settings → Secrets and variables → Actions). **Never commit the token** —
   this repo is public.
4. The next run delivers the briefing and includes your chat id — add it as
   `TELEGRAM_CHAT_ID` to make delivery permanent.

## Daily schedule

`.github/workflows/bitget-briefing.yml` runs the bot every day at **06:00 UTC**
(and on manual dispatch). The briefing lands in the workflow run's **job summary**
and is uploaded as an artifact. Add the notifier secrets above
(repo → Settings → Secrets → Actions) to get it pushed to Telegram/Slack/Discord.

> Note: some sandboxed/CI environments with restricted egress can't reach
> `api.bitget.com` / `www.bitget.com`; the bot needs ordinary internet access.
> Bitget also geo-blocks some regions — run it from a permitted region or proxy.
