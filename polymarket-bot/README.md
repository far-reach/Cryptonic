# polybot — a Polymarket opportunity scanner & trading bot ($100 bankroll)

A small, risk-managed bot that scans [Polymarket](https://polymarket.com)
for mispricings and trades them with a **$100 budget**. It ships in
**paper-trading mode by default**; live trading is an explicit, gated opt-in.

> **Honesty first:** no bot can guarantee profit. This bot stacks four edges
> that exist for structural reasons — maker rebates, basket arbitrage,
> book de-syncs, and the favorite-longshot bias — and wraps them in a risk
> manager whose job is to make sure no single mistake is fatal. Arbitrage
> windows are contested by faster bots, maker fills carry adverse-selection
> risk, and value bets can simply lose. Expect slow compounding with
> variance, not a money printer.

---

## How Polymarket works (the 2-minute version)

- Every market is a pair of outcome tokens (**YES**/**NO**) that resolve to
  **$1** or **$0**. Prices live on a central limit order book (CLOB) and are
  denominated in **USDC on Polygon**.
- One YES + one NO of the same market always pays exactly **$1** combined,
  and can be merged back into $1 of USDC.
- "Negative-risk" events ("Who will win X?") list one binary market per
  candidate and guarantee **exactly one YES** resolves true.
- **Fees (since March 2026):** *takers* pay `shares × rate × p × (1−p)` per
  trade (peaks at p=0.50; politics ≈ $1.00 max per 100 shares, crypto ≈
  $1.75, geopolitics free). **Makers pay nothing** — and 100% of taker fees
  are redistributed to makers as daily rebates. Every edge calculation in
  this bot is net of taker fees.

## The strategies

| # | Strategy | Type | Idea |
|---|----------|------|------|
| 1 | `market_maker` | income | Rest a BUY on YES at `b_y` and a BUY on NO at `b_n` with `b_y + b_n ≤ 1 − capture` in busy, wide-spread, mid-range markets. If both sides fill, we own a YES+NO pair worth exactly $1 — bought for less, with **zero fees**, plus maker rebates on top. One-sided fills are the risk: managed by mid-range-only quoting, per-market inventory caps, an inventory stop, and cancel/replace on drift. The most dependable earner for a small account. |
| 2 | `negrisk_arb` | **risk-free** | In a multi-outcome event, buy 1 YES of every candidate when they sum below $1 (pays exactly $1), or the full NO basket below $(n−1). Sizing walks all legs' book depth and stops where the marginal unit no longer clears the edge. YES baskets are skipped for "augmented" events (new candidates can appear); NO baskets are provably safe even then. |
| 3 | `complement_arb` | **risk-free** | Buy YES + NO of one market for < $1 after fees. Books are normally mirrored, so this only fires on rare de-syncs — free to check, free money when it happens. |
| 4 | `value_favorites` | probabilistic | Buy heavy favorites (0.90–0.985) within 14 days of resolution when the annualized after-fee return clears 35%. Quarter-Kelly sized, ≤ 8 positions, 15¢ stop-loss. **This one can lose.** |

## The loop (each cycle, ~30s; 6s after real activity, never latched)

1. scan markets + books (always including every token held or quoted)
2. **mark-to-market**: fresh best bids feed the drawdown halt — it fires on
   market value, not cost basis
3. **settlement**: resolved markets credit automatically ($1 winners, $0 losers)
4. sync resting maker orders → book fee-free maker fills
5. **merge** completed YES+NO pairs back to cash (paper mode)
6. inventory stop: dump **unpaired** maker inventory that ran 8¢ against us
   (hedged YES+NO pairs are locked profit and are never stopped out); the
   stopped market enters a ~20-minute quoting cooldown so losses can't churn
7. value stop-loss: exit favorites whose bid fell 15¢ below cost — exits are
   depth-aware (sell only what the book pays fairly for, retry the rest)
8. maker quote management: cancel stale → requote on 2-tick drift (in the
   market's own tick size) → place new
9. taker opportunities (arbs first, then value) through the risk gate

## Risk management (the part that matters at $100)

All enforced by `polybot/risk.py` and the portfolio ledger, none optional:

- max **$10 per trade**, max **$15 per market** (positions **and** resting
  orders count), max **80% deployed**, ≥ $20 always in cash
- resting BUY orders **reserve their cash up front** — quotes can never
  over-commit the bankroll
- quarter-Kelly for probabilistic bets; hard cap of 8 open value positions
- **halt everything** below $75 equity (25% drawdown) or −$10 realized in a
  day — the bot cancels all resting orders and stops
- risk-reducing exits (stops, unwinds) always pass the gate, even during a halt
- taker opportunities are deduplicated; maker quotes are deduplicated by a
  per-market quote registry (requoting is the normal cancel/replace cycle)

## Quick start

```bash
cd polymarket-bot
pip install -r requirements.txt

python -m polybot scan      # one-shot: what does it see right now? (no keys)
python -m polybot run       # paper-trade the full loop (no keys)
python -m polybot status    # cash / reserved / positions / orders / PnL
```

Run paper mode for **at least a week** before going live. Caveat: paper
maker fills are **optimistic** (no queue modeling — a resting bid "fills"
whenever the ask trades through it), so treat paper maker PnL as an upper
bound.

### Tests

```bash
pip install pytest && python -m pytest tests/ -q   # 62 tests, all offline
```

## Going live (deliberately annoying)

1. **Fund the account.** Deposit **$100 USDC** at polymarket.com → Deposit.
   Place one tiny manual trade in the UI first so trading approvals are
   initialized. Copy your proxy-wallet address from your profile.
2. **Install the trading client:** `pip install py-clob-client-v2`
   (the old `py-clob-client` was archived in May 2026 and no longer works).
3. **Set the environment** (copy `.env.example` → `.env`, `source .env`):
   - `POLYMARKET_PRIVATE_KEY` — controls the account. *Anyone with this key
     can drain the wallet. Keep only the $100 budget in it, never reuse the
     key, never commit it.*
   - `POLYMARKET_FUNDER_ADDRESS` — proxy wallet (empty for a plain EOA)
   - `POLYMARKET_SIGNATURE_TYPE` — 0 EOA · 1 email/Magic · 2 browser wallet
   - `POLYBOT_LIVE_ACK=I_UNDERSTAND_THE_RISKS`
4. **First live week, run conservative:** in `config.yaml` set
   `max_trade_usdc: 3`, `maker_quote_usdc: 4`, `value_enabled: false`. Then:
   ```bash
   python -m polybot run --live
   ```
5. Watch `python -m polybot status` daily against your Polymarket account
   page. If clean after a week, restore the default caps.

### Live-trading risks paper mode cannot show you

- **Leg risk** — multi-leg arbs fill sequentially (limit-FOK per leg, so
  each leg has a hard price cap); a failed later leg triggers an automatic
  unwind that eats the spread, and the unwind IS booked to the ledger so it
  counts toward the daily loss stop. Watch logs for `UNWIND FAILED` — that
  position must be closed manually.
- **Queue position** — live maker fills will be slower and more adverse
  than paper's optimistic simulation.
- **Pair capital** — completed live YES+NO pairs stay on the book until
  resolution unless you merge them in the Polymarket UI (Portfolio → Merge)
  to free the cash immediately; on-chain merge isn't exposed by the CLOB
  client yet.
- **Resolution risk** — markets resolve per their written rules (UMA
  oracle); a "sure thing" can resolve against the obvious reading.
- **Competition** — expect to win arb leftovers, not every scanned window.
- **Regulatory** — confirm Polymarket is legal where you live.

## Configuration

Everything lives in [`config.yaml`](config.yaml) — every threshold, cap and
cadence, commented inline. Secrets only ever come from the environment.

## Architecture

```
polybot/
  api.py            Gamma (metadata/settlement) + CLOB (books) REST, retries
  scanner.py        data pull, candidate prefilter, all strategies -> ScanResult
  strategies/
    market_maker.py paired maker quotes (fee-free spread capture)
    negrisk_arb.py  multi-outcome basket arb, depth-aware sizing
    complement_arb.py YES+NO de-sync arb, depth-aware sizing
    value.py        near-resolution favorites, quarter-Kelly
    depth.py        marginal-edge book walking shared by the arbs
  risk.py           caps, dedupe, drawdown halts — sole trade gatekeeper
  portfolio.py      cash/reserved/positions/orders ledger, JSON persistence
  settlement.py     resolution detection -> automatic position settlement
  executor/paper.py simulated taker fills + resting-order fill simulation
  executor/live.py  CLOB v2: FOK takers with auto-unwind, GTC makers with
                    status polling, cancel/replace
  bot.py            the cycle above + adaptive polling + clean shutdown
  fees.py           taker-fee model: shares × rate × p × (1−p), per category
```

## Roadmap

- WebSocket book streaming (`ws-subscriptions-clob.polymarket.com`) to
  react in ~1s instead of 6–30s polling.
- On-chain pair merge for live mode (via Polymarket's unified `py-sdk`)
  to recycle maker capital without waiting for resolution.
- Cross-venue arbitrage vs. Kalshi on equivalent markets.

## Disclaimer

Educational software. Not financial advice. Prediction-market trading can
lose your entire stake; use money you can afford to lose. You are
responsible for legal compliance in your jurisdiction.
