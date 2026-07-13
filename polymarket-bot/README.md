# polybot — a Polymarket opportunity scanner & trading bot ($100 bankroll)

A small, risk-managed bot that scans [Polymarket](https://polymarket.com)
for mispricings and trades them with a **$100 budget**. It ships in
**paper-trading mode by default**; live trading is an explicit, gated opt-in.

> **Honesty first:** no bot can guarantee profit. What this bot does is
> (a) hunt for *structural arbitrage* — positions whose payout at resolution
> exceeds their cost no matter the outcome — and (b) take small, fee-aware,
> Kelly-sized positions in near-certain favorites, a documented statistical
> edge (favorite-longshot bias). Arbitrage windows are rare, small, and
> contested by faster bots; the value strategy can and will lose individual
> bets. The risk manager exists to make sure no single mistake is fatal.

---

## How Polymarket works (the 2-minute version)

- Every market is a pair of outcome tokens (**YES**/**NO**) that resolve to
  **$1** or **$0**. Prices live on a central limit order book (CLOB) and are
  denominated in **USDC on Polygon**.
- One YES + one NO of the same market always pays exactly **$1** combined,
  and can be merged back into $1 of USDC at any time.
- "Negative-risk" events ("Who will win X?") list one binary market per
  candidate and guarantee **exactly one YES** resolves true.
- **Fees (since March 2026):** *takers* pay `shares × rate × p × (1−p)` per
  trade — the fee peaks at p=0.50 and vanishes toward $0/$1. Rates vary by
  category (politics ≈ $1.00 max per 100 shares, crypto ≈ $1.75,
  geopolitics free). **Makers pay nothing** and earn rebates. Every edge
  calculation in this bot is net of taker fees.

## The strategies

| # | Strategy | Type | Idea |
|---|----------|------|------|
| 1 | `negrisk_arb` | **risk-free** | In a multi-outcome event, buy 1 **YES of every candidate** when they sum below $1 (basket must pay exactly $1), or 1 **NO of every candidate** when the NO basket costs less than $(n−1). Sibling markets have independent books, so they genuinely drift out of line — this is the workhorse. The YES basket is skipped for "augmented" events (where new candidates can still be added); the NO basket is provably safe even then. |
| 2 | `complement_arb` | **risk-free** | Buy YES + NO of one market for < $1 after fees. Polymarket's matching engine keeps the two books mirrored, so this only fires on rare de-syncs — it costs nothing to check and is free money when it happens. |
| 3 | `value_favorites` | probabilistic | Buy heavy favorites (0.90–0.985) within 14 days of resolution when the annualized return after fees clears 35%. Harvests the favorite-longshot bias plus time-value convergence. Sized at quarter-Kelly, diversified across ≤ 8 positions. **This one can lose.** |

Planned next (see roadmap): passive market-making to *earn* the maker
rebates instead of paying taker fees.

## Risk management (the part that matters at $100)

All enforced by `polybot/risk.py`, none of it optional:

- max **$10 per trade**, max **$15 per market**, max **80% deployed** (≥ $20
  always in cash)
- quarter-Kelly sizing for probabilistic bets, hard cap of 8 open value positions
- **halt everything** if equity drops below $75 (25% drawdown) or realized
  losses hit **−$10 in a day**
- every opportunity is deduplicated by key — the bot never doubles into the
  same mispricing
- unknown fee categories are charged the *conservative* (higher) rate when
  estimating edge

## Quick start

```bash
cd polymarket-bot
pip install -r requirements.txt

# 1. one-shot scan — see what's out there right now (no keys needed)
python -m polybot scan

# 2. paper-trade the loop (no keys needed; state in state/portfolio.json)
python -m polybot run

# 3. check the book
python -m polybot status
```

Run paper mode for **at least a week** and look at `status` before even
thinking about live mode.

### Tests

```bash
pip install pytest && python -m pytest tests/ -q
```

## Going live (deliberately annoying)

1. **Fund a wallet.** Deposit **$100 USDC** to your Polymarket account
   (polymarket.com → Deposit). Your funds live in a proxy wallet; copy its
   address from your profile.
2. **Install the trading client:** `pip install py-clob-client-v2`
   (the old `py-clob-client` was archived in May 2026 and no longer works —
   Polymarket migrated to CLOB v2).
3. **Set the environment** (copy `.env.example` → `.env`, `source .env`):
   - `POLYMARKET_PRIVATE_KEY` — the key that controls the account.
     *Anyone with this key can drain the wallet. Keep at most your $100
     budget in it, never reuse the key elsewhere, never commit it.*
   - `POLYMARKET_FUNDER_ADDRESS` — your proxy wallet address (empty for a
     plain EOA holding the USDC itself)
   - `POLYMARKET_SIGNATURE_TYPE` — 0 EOA · 1 email/Magic login · 2 browser wallet
   - `POLYBOT_LIVE_ACK=I_UNDERSTAND_THE_RISKS`
4. ```bash
   python -m polybot run --live
   ```

### Live-trading risks paper mode cannot show you

- **Leg risk** — multi-leg arbs fill sequentially (FOK per leg). If leg 3 of
  a basket fails after legs 1–2 filled, the bot unwinds at market and eats
  the spread. Small sizes keep this cheap, never zero.
- **Competition** — arbitrage on Polymarket is contested by low-latency
  bots. Expect to win the leftovers, not every window a scan shows.
- **Resolution risk** — markets resolve per their written rules (UMA
  oracle). A "sure thing" can resolve against the obvious reading.
- **Stale books** — a beautiful edge on a dead market usually means the
  price is stale, not that you're early. Volume/liquidity floors filter
  most of this; not all.
- **Regulatory** — check that trading on Polymarket is legal where you live.

## Configuration

Everything lives in [`config.yaml`](config.yaml) (thresholds, caps, fee-rate
overrides, poll interval) — commented inline. Secrets only ever come from
the environment.

## Architecture

```
polybot/
  api.py            Gamma (metadata) + CLOB (books) public REST clients, retries
  scanner.py        pulls data, prefilters candidates, runs all strategies
  strategies/       complement_arb | negrisk_arb | value  (pure functions of data)
  risk.py           sizing, caps, dedupe, drawdown halts — sole trade gatekeeper
  executor/paper.py simulated fills at scanned prices
  executor/live.py  CLOB v2 FOK orders, sequential legs + auto-unwind
  portfolio.py      cash / positions / PnL, persisted to state/portfolio.json
  bot.py            scan → risk-check → execute loop
  fees.py           taker-fee model: shares × rate × p × (1−p), per category
```

Data sources (public, no auth): `gamma-api.polymarket.com` for market and
event metadata, `clob.polymarket.com` for order books.

## Roadmap

- **Market-making mode** — quote both sides of tight, active markets as a
  *maker*: zero fees plus the Maker Rebates Program (rebates funded by 100%
  of taker fees). This is the most reliable earner for small accounts, at
  the cost of real order-management complexity (cancel/replace, inventory
  and adverse-selection control).
- Settlement detection: auto-credit resolved positions in paper mode.
- WebSocket book streaming (`ws-subscriptions-clob.polymarket.com`) to react
  in seconds instead of the 30s polling cadence.
- Cross-venue arbitrage vs. Kalshi on equivalent markets.

## Disclaimer

Educational software. Not financial advice. Prediction-market trading can
lose your entire stake; use money you can afford to lose. You are
responsible for legal compliance in your jurisdiction.
