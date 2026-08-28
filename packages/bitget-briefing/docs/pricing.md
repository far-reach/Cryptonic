# Pricing — the freemium subscription model

How the Bitget briefing makes money, and why it's built this way.

## The model

**Freemium subscription** — per the 2026 extension-monetization research, the most durable
model across sources: *a genuinely good free version, with the daily-reach-for feature paid.*
Typical pricing lands at $5–15/month for consumer tools and $15–49/month for AI-heavy or
professional tools, with annual priced at 8–10× monthly. And the model's one hard warning:
**a free tier that feels crippled drives uninstalls, not upgrades.**

Applied to this product, that gives four design rules:

1. **The free tier is the complete product, not a teaser.** You get the full classified daily
   briefing — every delisting, freeze, maintenance window, and security notice, with importance
   stars, the environment gauge, and the plain-language "why". Someone who never pays should
   still open it every morning.
2. **Safety is never the upsell.** Anything that can cost you money is free forever. A paywall
   in front of "your coins are being delisted" doesn't convert — it churns, and it's wrong.
3. **Paid is the daily-reach-for depth**, not withheld basics: live entry/TP/SL brackets on the
   trade angles, the Sunday weekly review, the 7-day trend chart, every delivery channel at
   once, longer look-back windows.
4. **Priced inside the researched bands**, annual at 8–10× monthly (two months free, roughly).

## Plans

| | **Free** | **Pro** | **Desk** |
|---|---|---|---|
| Price | $0 | **$9/mo · $79/yr** (≈8.8×) | **$29/mo · $249/yr** (≈8.6×) |
| For | every trader | one trader who reaches for it daily | a team / trading desk |
| Daily briefing (critical · notable · FYI) | ✅ | ✅ | ✅ |
| All safety alerts (delist / freeze / security) | ✅ **free forever** | ✅ | ✅ |
| Importance stars, environment gauge, plain-language "why" | ✅ | ✅ | ✅ |
| `--critical-only` alert scheduling, `--demo` | ✅ | ✅ | ✅ |
| Trade angles (stance + reasoning) | ✅ | ✅ | ✅ |
| Trade angles with live entry / TP / SL brackets | — | ✅ | ✅ |
| Sunday weekly review (`--weekly`) | — | ✅ | ✅ |
| 7-day severity trend chart | today's counts | ✅ | ✅ |
| Delivery channels (Telegram / Slack / Discord) | any **one** | all at once | all at once |
| Look-back window | up to 48h | custom | custom |
| Seats / commercial use | personal | 1 | up to 5, commercial |
| Support | community | email | priority |

The free tier shows a single one-line footer on the markdown briefing pointing at Pro. That's
the entire upsell surface: it never appears inside chat notifications, and
`BRIEFING_NO_UPSELL=1` removes it. No nag screens, no trial timers, no feature that stops
working mid-week.

## Activating a plan

Checkout (Stripe, or USDC — ideally paid confidentially over VEIL) delivers a license key.
Activate it with one env var wherever the bot runs (shell, GitHub Actions secret, cron):

```bash
export BRIEFING_LICENSE_KEY="veil1.…"
npx bitget-briefing --plan   # shows the active plan, license state & entitlements
```

License keys are **verified offline**: the key is an Ed25519-signed statement of
`plan / email / expiry`, checked against the vendor public key baked into the build. No
license server, no phone-home, no telemetry — the email in the key is attribution only and
never leaves your machine. A lapsed renewal gets a **7-day grace window** (with a stderr
reminder) before the plan drops back to free, so an expired card never silences a delisting
warning on the day it matters. Any license problem degrades to the free tier with a one-line
notice — licensing can never break the briefing.

## Vendor operations

```bash
# once, at release time — public half ships in src/license.ts (or the
# BRIEFING_LICENSE_PUBLIC_KEY env var); private half goes in the secret manager
npx bitget-briefing-license keygen

# per customer, from checkout webhook or by hand
npx bitget-briefing-license issue --key "$PRIVATE_KEY" --plan pro --email trader@example.com --days 365

# support / debugging
npx bitget-briefing-license verify "veil1.…"
```

The public key currently in `src/license.ts` is a placeholder trust root generated for this
prototype (its private half was never stored); replace it via `keygen` before selling keys, or
point deployments at your own root with `BRIEFING_LICENSE_PUBLIC_KEY`.

## Honesty about open source

This bot is source-available, so gating is honor-based — anyone can fork the repo and flip the
gates. That's fine, and it's priced in: the people who do that were never customers, and the
research is clear that the durable money is in a subscription people *want* to keep — for the
daily-reach-for depth, key delivery, the hosted daily/weekly channel, and supporting the
product — not in DRM. The free tier being genuinely good is the marketing; the paid tier being
genuinely deeper is the business.

## Revenue sketch (illustrative, consumer line only)

At a 2–5% free→paid conversion (typical for a good freemium tool with a daily habit loop):
10k installs → 200–500 Pro at ~$9/mo ≈ **$22–54k ARR**, before Desk. This is the consumer
revenue line of the VEIL plan (see `docs/launch-plan.md` §4); it exists to fund the briefing
product and prove retention, not to carry the company.
