# @veil/trader — Cryptonic autotrader

A conservative **spot grid-trading bot for Binance**, sized for a small starting budget
(defaults are tuned for **250 USDT**). It buys inside a price range and sells one grid level
higher, harvesting volatility while the market goes sideways — with hard risk limits, a
paper-trading default, and a mainnet gate you have to consciously unlock.

> **This is not guaranteed passive income.** No trading bot is. Grid trading earns small,
> compounding profits in *ranging* markets and **loses money in sustained trends**: in a
> strong downtrend it accumulates a falling asset until the safety stop fires (a bounded but
> real loss), and in a strong uptrend it under-performs simply holding. Past or backtested
> performance does not predict future results. Never trade money you can't afford to lose.
> Nothing here is financial advice.

## Why a grid, and why now

The repo's [market research (July 2026)](../../docs/market-research-2026.md) describes a
bear/ranging regime: BTC ~$64k (~53% off ATH), negative ETF flows, macro tightening. For a
250 USDT budget this rules out most alternatives:

| Approach | Verdict for 250 USDT in a ranging market |
|---|---|
| Trend-following / momentum | Whipsawed in ranges; fees + slippage eat a small account. |
| Futures / leverage | Liquidation risk; can lose more than intended. Excluded by design. |
| HFT / market-making | Impossible at retail latency and fee tiers. |
| Buy & hold ("HODL") | Full downside exposure; earns nothing while price goes sideways. |
| **Spot grid (this bot)** | Monetizes sideways chop; risk bounded by budget + stop; no leverage. |

The math per round-trip: adjacent grid levels are ~1.5–1.6% apart (11 levels over a ±6%
range), and each buy→sell pair nets **one grid step minus two 0.1% fees ≈ +1.3–1.4%** on the
~22 USDT slot involved (≈ +0.30 USDT). Income scales with how often price crosses levels —
i.e. with volatility, not direction.

A 2,000-candle synthetic sideways backtest (hourly, 0.4–0.5% vol — run it yourself, it's
deterministic) yields roughly **+6.7% in ~66 days vs −1% buy-and-hold**, with a 3.4% max
drawdown. Treat that as an illustration of the mechanism, not a forecast: real markets trend,
gap, and change regime.

## Safety design

- **Spot only, no leverage, no shorting.** The bot can never owe money.
- **Hard budget cap.** Order sizing derives from `risk.budgetQuote` (250), not your account
  balance — the bot cannot deploy more even if your account holds more.
- **10% fee/slippage reserve** (`reserveFraction`) is never traded.
- **Emergency stop.** If price breaks 10% below the grid floor, the bot cancels its orders,
  liquidates only the inventory *it* bought, and halts until a human restarts it.
- **Daily loss brake.** After a realized loss of 5% of budget in a UTC day, no new buys until
  the next day (sells stay active — they only de-risk).
- **Testnet by default.** Mainnet live trading additionally requires
  `TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS` *and* an explicit `baseUrl` change.
- **Touches only its own orders.** All bot orders carry `grid-*` client ids; cancel-all
  ignores your manual orders on the same pair.
- **Crash-safe state.** Atomic state-file writes; on restart it re-attaches to its open
  orders and continues (Ctrl-C leaves orders resting by design).
- **Kill switch, heartbeat, alerts, reconciliation.** `AUTOTRADER_ENABLED=false` (or a
  `trader.kill` file) exits at the next tick — the only sanctioned way to intervene, ever;
  no per-trade manual overrides exist by design. `TRADER_HEARTBEAT_URL` gets pinged every
  healthy tick (point it at a free healthchecks.io check for a dead-man's switch);
  `TRADER_ALERT_URL` receives a plain-text POST on halt transitions. In live mode the bot
  periodically reconciles its books against actual exchange balances and alerts loudly on
  mismatch — an independent truth-check that catches silent accounting bugs.
- **Pre-registered success/kill criteria.** [`PREREG.md`](PREREG.md) locks, *before*
  deployment, what counts as success, what triggers shutdown, and which knobs may never be
  tuned in reaction to a losing week. Read it before going live; obey it after.

## Quick start

```bash
cd packages/trader
npm install && npm run build

npm test                                   # 23 unit + end-to-end backtest tests

# 1. Offline: deterministic synthetic backtests (no network needed)
node dist/cli.js backtest --synthetic 42 --candles 2000            # sideways regime
node dist/cli.js backtest --synthetic 3 --candles 400 --drift=-0.003   # grinding bear

# 2. Real data: download candles, then backtest them
node dist/cli.js fetch-data --interval 1h --candles 720 --out btc-1h.csv \
  --config config.example.json
node dist/cli.js backtest --csv btc-1h.csv

# 3. Paper trade live prices (simulated orders, no API keys needed)
node dist/cli.js paper

# 4. Binance TESTNET with real orders (free keys: https://testnet.binance.vision)
export BINANCE_API_KEY=... BINANCE_API_SECRET=...
node dist/cli.js live

# 5. Mainnet — only after 2–4 weeks of 3 & 4 look sane (see checklist below)
node dist/cli.js status        # inspect state anytime
```

### Going live on mainnet (checklist)

1. Follow the promotion gates in [`PREREG.md`](PREREG.md): backtest on real data → ≥ 14
   days paper → ≥ 7 days testnet (fills, a restart-resume, clean reconciliation) → mainnet.
   The success and kill criteria there are locked — don't renegotiate them after seeing
   results.
2. Use a **dedicated Binance sub-account** holding only the budget, with its own API key:
   enable *Reading* + *Spot & Margin Trading* only. **Never enable withdrawals.** Restrict
   the key to your server's IP. The sub-account boundary also keeps your manual trading —
   statistically the bigger loss source — physically separate from the bot's capital.
3. Fund the account with exactly the budget (250 USDT) — the cap is belt; this is braces.
4. Copy `config.example.json`, set `"baseUrl": "https://api.binance.com"`, and pick the grid
   range: `lower`/`upper` = 0 auto-ranges from the last 30 days, or set them manually around
   strong support/resistance.
5. Start with `TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS` set, under a process supervisor
   (`systemd`, `pm2`, or Docker `--restart=on-failure`) so it resumes after reboots.
6. Check `status` daily. Expect: many small realized profits in chop; idle periods when price
   sits above the range; a halt + realized loss if the market crashes through the floor.
   Rebase the grid (delete the state file, restart) when price exits the range for good.

## Portable deployment

The bot is fully portable: everything it needs is one env file + one config file + the
state file, on any Docker host or systemd Linux box. See [`ROADMAP.md`](ROADMAP.md) for
the dated plan to go-live.

**Docker** (any machine with Docker):

```bash
cd packages/trader
mkdir -p data && cp config.example.json data/config.json && cp .env.example .env
# edit .env (keys, heartbeat/alert URLs) and data/config.json, then:
docker compose up -d --build      # paper mode by default; logs: docker compose logs -f
docker compose run --rm trader gates --config config.json   # check gate progress
```

**Bare VPS** (fresh Ubuntu 24.04, ~€4/month tier is plenty):

```bash
sudo ./deploy/setup-vps.sh        # installs Node 22, builds, installs systemd unit
sudo nano /opt/cryptonic/run/.env # keys + URLs
sudo systemctl start trader && journalctl -u trader -f
```

Both paths default to **paper mode**; switching the command/unit to `live` is a manual,
deliberate act tied to the PREREG gates. State lives in `data/` (Docker) or
`/opt/cryptonic/run/` (systemd) and survives restarts and image rebuilds. The kill
switch works in both: `touch trader.kill` in the state directory.

## Multiple assets (fleet mode)

One bot instance trades one pair; a *fleet* is simply several instances with their own
config, budget slice, and state file (see [`configs/`](configs)). The starter fleet for
250 USDT is **BTC (100) + ETH (75) + SOL (75)** — deep-liquidity majors only.

```bash
# systemd (one service per symbol, via the template unit):
sudo cp deploy/trader@.service /etc/systemd/system/
sudo cp configs/*.json /opt/cryptonic/run/
sudo systemctl enable --now trader@BTCUSDT trader@ETHUSDT trader@SOLUSDT
node dist/cli.js status --config /opt/cryptonic/run/ETHUSDT.json   # per-symbol status
```

Why not "the top 100 coins": each grid needs ~8 slots comfortably above Binance's
~5 USDT minimum order size, so **a grid costs ~75–100 USDT to run properly — 250 USDT
funds at most 3**. Spreading thinner means orders get rejected or single-slot grids
with no compounding. Also, outside the majors, thin books widen slippage and ranges
break more violently. The expansion rule (PREREG Amendment 3): one new symbol, by
30-day volume rank, per ~75–100 USDT of new capital or realized profit — after the
30-day success evaluation passes.

Market data (backtests, auto-ranging, paper prices) always comes from
`binance.dataUrl` — the real-market mirror `data-api.binance.vision` — even when
orders go to the testnet. Testnet price *history* is thin-book garbage and must never
size a grid; only its order-matching engine is used, in gate 3.

## How it works

The range `[lower, upper]` is split into `levels − 1` geometric slots; each owns an equal
share of the tradable budget (250 × 0.9 / 10 ≈ 22.5 USDT). Every slot is a tiny state
machine — `EMPTY → PENDING_BUY → HOLDING → PENDING_SELL → EMPTY` — that buys at its lower
level and sells the same lot at its upper level. Buys only rest *below* market price, so the
bot never crosses the spread, never market-buys, and its worst case is fully-deployed
inventory bought across the lower half of the range.

One engine (`GridBot.tick()`: observe fills → risk gate → reconcile orders) runs unchanged in
all three modes; only the `Exchange` implementation differs:

| Mode | Exchange | Orders | Use |
|---|---|---|---|
| `backtest` | `PaperExchange` fed candles | simulated | strategy validation |
| `paper` | `PaperExchange` fed live ticker | simulated | live rehearsal, zero risk |
| `live` | `BinanceExchange` (signed REST) | **real** | testnet, then mainnet |

The live client is dependency-free (native `fetch` + `node:crypto` HMAC-SHA256) and respects
exchange filters (tick size, lot step, min-notional) loaded from `/exchangeInfo`.

## Configuration

All knobs live in one JSON file (see [`config.example.json`](config.example.json)); defaults
are the 250 USDT profile described above. Secrets come only from environment variables.

| Key | Default | Meaning |
|---|---|---|
| `symbol` | `BTCUSDT` | Deep-liquidity USDT pairs only (BTC/ETH) at this budget size. |
| `grid.lower/upper` | `0` (auto) | Trading range; auto = 30-day low/high ± 2%. |
| `grid.levels` | `11` | Grid lines → 10 slots ≈ 22.5 USDT each (min ~6 USDT/slot enforced). |
| `risk.budgetQuote` | `250` | Hard deployment cap in USDT. |
| `risk.reserveFraction` | `0.1` | Never-traded fee/slippage buffer. |
| `risk.stopBelowFloor` | `0.1` | Emergency-stop distance under the grid floor. |
| `risk.maxDailyLossFraction` | `0.05` | Daily realized-loss brake (12.5 USDT). |
| `pollSeconds` | `30` | Main-loop cadence; grid orders rest on the book between polls. |

## Realistic expectations for 250 USDT

- Round-trips net ≈ +0.30 USDT each; an active sideways week might produce a handful to a few
  dozen of them. Think **single-digit percent per month in favorable (choppy) conditions**,
  zero in quiet ones, and occasional bounded losses — not a salary.
- Fees matter at this size: consider paying fees in BNB for the 25% discount, and avoid pairs
  where 22 USDT orders sit near the min-notional floor.
- Profits are likely taxable events in most jurisdictions; every fill is in your Binance
  history and the bot's state file.
- The bot needs a machine that stays on. A $5/month VPS or a Raspberry Pi is plenty (the
  loop is one REST poll every 30s) — but note that fixed costs eat a big share of small-account
  returns.

## Limitations & sensible next steps

Deliberately not included yet: WebSocket user-data streams (REST polling is simpler and fine
at 30s), automatic grid re-centering when price exits the range (that's a *decision*, not a
mechanic — a wrongly automated rebase converts paper losses to real ones), multi-pair
support, and exact fee accounting from `myTrades` (live PnL conservatively assumes 0.1%/fill).
Reasonable extensions, roughly in order of value: trailing grid rebase with confirmation,
BNB-fee awareness, a small status web page, Telegram alerts on fills/halts.
