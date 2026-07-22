# polybot — Project Handoff & Continuation Report

**A Polymarket trading bot for a $100 bankroll. Paper-trading mode works today;
live trading is fully implemented but has never touched the real Polymarket
API (it was built in a sandbox whose network blocks polymarket.com).**

This document is the single source of truth for continuing the project. It is
written so that **a fresh Claude Code session on your machine (with no memory
of how this was built) can read this one file and pick up precisely where we
left off.** Read it top to bottom before changing anything.

- **Status:** 72 automated tests passing, all offline. 4 strategies, full
  order lifecycle, adversarially reviewed (24 confirmed bugs found and fixed).
- **Language:** Python 3.11+ (no compiled deps; `requests` + `PyYAML` only for
  paper mode, plus `py-clob-client-v2` for live).
- **Lines of code:** ~2,600 in `polybot/`, plus ~900 of tests.
- **Git:** repo `far-reach/Cryptonic`, branch
  `claude/polymarket-trading-bot-i4idu4`, code under `polymarket-bot/`.

---

## 1. The goal (what this bot is for)

Build a bot that trades on [Polymarket](https://polymarket.com) — a
prediction market where you buy YES/NO shares that resolve to $1 or $0 — and
tries to **grow a $100 budget while making it structurally impossible for one
mistake to blow up the account.**

The design philosophy, in one sentence: **stack edges that exist for
structural reasons (fees, arbitrage, statistical bias), size them small, and
let a hard-coded risk manager veto anything that breaks the rules.** No
promises of profit — arbitrage windows are contested and small, maker fills
carry adverse-selection risk, and probabilistic bets lose sometimes. The bot's
job is to be *survivable* first and *profitable* second.

### How Polymarket works (the essentials the code relies on)

- Every market is a pair of outcome tokens (**YES**/**NO**) priced in **USDC
  on Polygon**, resolving to **$1** or **$0**.
- **1 YES + 1 NO of the same market always pays exactly $1** combined, and can
  be merged back into $1 of USDC. → basis of `complement_arb` and the maker
  pair-capture.
- **Negative-risk events** ("Who will win X?") list one binary market per
  candidate and guarantee **exactly one YES resolves true**. → basis of
  `negrisk_arb`.
- **Fees (March 2026 schedule):** *takers* pay `shares × rate × p × (1−p)` per
  trade (peaks at p=0.50; politics ≈ 1.0% max, crypto ≈ 1.75%, geopolitics
  free). **Makers pay ZERO fees and earn daily rebates** funded by 100% of
  taker fees. → this is the single biggest reason the market-maker strategy is
  the most promising earner.

---

## 2. Getting the code onto `C:\Polymarketbot`

The code already lives in Git. Two ways to get it onto your machine:

### Option A — clone just this project (recommended)

```powershell
# In PowerShell:
cd C:\
git clone --branch claude/polymarket-trading-bot-i4idu4 ^
  https://github.com/far-reach/Cryptonic.git Cryptonic-tmp
# The bot is the polymarket-bot/ subfolder — move it to C:\Polymarketbot:
Move-Item C:\Cryptonic-tmp\polymarket-bot C:\Polymarketbot
Remove-Item -Recurse -Force C:\Cryptonic-tmp
cd C:\Polymarketbot
```

### Option B — you already have the files

If you copied `polymarket-bot/` to `C:\Polymarketbot` by hand, make sure the
folder layout matches Section 4 below and that `.env` and `state/` are **not**
present from someone else's machine (they're gitignored for a reason).

### First-time Windows setup

```powershell
cd C:\Polymarketbot

# 1. Install Python 3.11+ from python.org if you don't have it. Verify:
py --version

# 2. Create and activate a virtual environment:
py -m venv venv
venv\Scripts\Activate.ps1        # (PowerShell)   or  venv\Scripts\activate.bat (cmd)

# 3. Install dependencies:
pip install -r requirements.txt
pip install pytest               # for the test suite

# 4. Confirm everything works — run the tests (all offline, no keys needed):
python -m pytest tests/ -q       # expect: 72 passed

# 5. Run a live scan (this is the FIRST thing the sandbox could never do —
#    it needs real network access to polymarket.com, which your PC has):
python -m polybot scan
```

> **The scan in step 5 is the most important next action.** It's the first
> time this code will hit the real Polymarket APIs. If it prints
> opportunities (or "No opportunities…"), the API integration works. If it
> errors, that error is the top-priority fix — see Section 8, item 0.

---

## 3. How to run it (all platforms)

| Command | What it does | Needs keys? |
|---|---|---|
| `python -m polybot scan` | One-shot: fetch markets, print every opportunity found this instant. | No |
| `python -m polybot run` | **Paper-trade** the full loop forever (simulated fills, state saved to `state/portfolio.json`). Ctrl-C stops and cancels resting orders. | No |
| `python -m polybot run --live` | **Real orders** on Polymarket. Gated behind env vars + an explicit ack. | Yes |
| `python -m polybot status` | Print portfolio snapshot: cash, reserved, positions, open orders, PnL. | No |
| `python -m polybot -v run` | Same as `run` but verbose (DEBUG) logging — shows *why* opportunities were skipped. | — |

**Recommended path:** run `python -m polybot run` in paper mode for **at least
a week** (use a spare PC, a VPS, or leave a terminal open). Judge it on: how
often the market-maker actually gets two-sided fills, whether arb edges look
sane (0.5–2%, not absurd 20% — those mean stale books), and whether equity
holds or grows. Paper maker fills are **optimistic** (no order-queue
modelling), so treat paper maker PnL as an upper bound.

---

## 4. What has been built — precise architecture

Every file in `polybot/`, what it does, and the key things to know:

```
polybot/
  __main__.py       `python -m polybot` entrypoint -> cli.main()
  cli.py            argparse CLI: scan | run [--live] | status
  config.py         Config dataclasses; loads config.yaml + .env + env vars
  models.py         All data types: Market, OrderBook, Leg, Opportunity,
                    Position, Fill, OpenOrder, BookLevel. Parsers for the
                    Gamma/CLOB JSON shapes live here (from_gamma/from_clob).
  fees.py           Taker-fee model: shares × rate × p × (1−p), per category.
  api.py            Public REST clients (NO auth needed):
                      GammaClient  -> markets, negRisk events, settlement lookups
                      ClobClient   -> order books (batch POST /books + GET /book)
                    Http wrapper: retries w/ backoff, 429 handling.
  scanner.py        Orchestrates one cycle: pull data -> prefilter which books
                    to fetch (bounded) -> run all 4 strategies -> rank. Returns
                    a ScanResult (opportunities + books + markets).
  strategies/
    base.py         Strategy ABC (pure function of data -> opportunities).
    depth.py        size_basket(): walks multiple book levels across all legs,
                    stops at the share where the MARGINAL unit stops clearing
                    the edge threshold. Fees accumulated per level. Shared by
                    both arb strategies.
    negrisk_arb.py  RISK-FREE. Multi-outcome basket arb. YES basket (buy 1 YES
                    of every candidate, pays $1) requires the FULL outcome set;
                    NO basket (pays $n−1) is safe even if not exhaustive.
    complement_arb.py RISK-FREE. Buy YES+NO of one market for <$1 after fees.
                    Only fires on rare book de-syncs (books are normally
                    mirrored) — cheap to check, free money when present.
    market_maker.py INCOME. Rests paired YES/NO bids summing <$1 in busy,
                    wide-spread, mid-range markets. Fills are fee-free + earn
                    rebates. Emits execution="maker" opportunities.
    value.py        PROBABILISTIC. Buys heavy favorites (0.90–0.985) near
                    resolution when annualized after-fee return clears 35%.
                    Quarter-Kelly sized. THIS ONE CAN LOSE.
  risk.py           RiskManager — the ONLY thing allowed to size/veto a trade.
                    Caps, dedupe, mark-to-market drawdown halt, daily-loss stop.
  portfolio.py      The ledger: cash / reserved / positions / open_orders /
                    fills / realized_pnl. JSON-persisted (atomic writes).
                    Resting BUY orders reserve cash up front.
  settlement.py     Detects resolved markets via Gamma and credits held
                    positions ($1 winner / $0 loser), fee-free.
  executor/
    base.py         Executor ABC: execute (taker) + place_maker + cancel_order
                    + sync_orders.
    paper.py        Simulated fills. Taker fills at the walked avg price; maker
                    orders "fill" when the book trades through the resting bid.
    live.py         Real CLOB v2 orders. Limit-FOK takers with auto-unwind,
                    GTC makers with status polling + reconcile-before-cancel.
  bot.py            The main loop (see cycle order below).
```

### The trading loop (`bot.py`, one cycle ≈ 30s; 6s after real activity)

1. **Scan** markets + books (always includes every token we hold or quote).
2. **Mark-to-market** — feed fresh best-bid prices to the risk manager so the
   drawdown halt sees real market value, not cost basis.
3. **Settlement** (every N cycles) — credit resolved markets automatically.
4. **Sync resting orders** — book any maker fills that happened.
5. **Merge** completed YES+NO maker pairs back to cash (paper mode only).
6. **Inventory stop** — dump *unpaired* maker inventory that ran 8¢ against
   us; the market then enters a ~20-min quoting cooldown (no churn).
7. **Value stop-loss** — exit favorites whose bid fell 15¢ below cost;
   depth-aware (only sells what the book fairly pays for).
8. **Maker quote management** — cancel stale/drifted quotes, place new ones.
9. **Taker opportunities** (arbs first, then value) through the risk gate.

### The 4 strategies at a glance

| Strategy | Type | Fires when | Risk |
|---|---|---|---|
| `market_maker` | income | busy, wide-spread, mid-range market | one-sided fills (adverse selection) — capped + stopped |
| `negrisk_arb` | risk-free | basket of candidates mis-prices | leg risk on execution only |
| `complement_arb` | risk-free | YES+NO book de-syncs below $1 | leg risk on execution only |
| `value_favorites` | probabilistic | cheap near-certain favorite | favorite can still lose the full stake |

### Risk controls (all in `risk.py` + `portfolio.py`, none optional)

- **≤ $10 per trade**, **≤ $15 per market** (positions *and* resting orders
  count), **≤ 80% deployed** (always ≥ $20 cash).
- Quarter-Kelly sizing for probabilistic bets; **≤ 8** open value positions.
- **Drawdown halt** below $75 equity (**mark-to-market**, not cost) — cancels
  all resting orders and stops the loop.
- **Daily loss stop** at −$10 realized (includes settlement + unwind losses).
- Resting BUY orders **reserve their cash up front** — quotes can never
  over-commit the bankroll.
- Risk-reducing exits (stops, unwinds) always pass, even during a halt.

### Configuration

Everything tunable lives in **`config.yaml`** (commented inline) — thresholds,
caps, cadences, per-category fee overrides. **Secrets never go in yaml**; they
come from the environment or a `.env` file (auto-loaded by `config.py`; see
`.env.example`).

---

## 5. Current state — what's verified vs. not

| Area | State |
|---|---|
| All 4 strategies | ✅ Unit-tested against realistic fixtures |
| Fee model, depth sizing, Kelly | ✅ Verified numerically |
| Ledger (cash/reserve/positions/PnL) | ✅ Invariants tested incl. crash-atomicity |
| Risk caps + halts | ✅ Tested incl. mark-to-market drawdown |
| Paper executor | ✅ Full place→fill→merge→settle cycle tested |
| Settlement detection | ✅ Parsing + credit logic tested |
| **Live executor** | ⚠️ **Code complete, NEVER run against real API** |
| **Live scan / real market data** | ⚠️ **Never run — sandbox blocked polymarket.com** |

The **critical unknown** is the live path: the sandbox this was built in could
not reach polymarket.com, so `api.py` and `executor/live.py` have been written
carefully against Polymarket's documented API shapes but never exercised. Your
machine can do this. **Validating the live API is job #0** (Section 8).

---

## 6. The adversarial review (context you should not lose)

Before this handoff, the codebase was reviewed by 5 independent passes (math,
ledger accounting, order lifecycle, API contracts, risk-control holes), each
required to *prove* a bug with a concrete numeric trace. **24 real bugs were
found and fixed** — the notable ones, so you don't reintroduce them:

- Settlement queries sent `condition_ids` comma-joined → silently matched
  nothing → **settlement never fired**. Now sent as repeated params.
- Drawdown halt valued positions at **cost**, so it could only fire *after*
  losses were realized. Now mark-to-market every cycle.
- Live cancel released reserved cash even when the order had actually **filled**
  → phantom cash. Now reconciles matched size *before* releasing.
- Live market orders had **no price cap** and booked fills at assumed prices.
  Now limit-FOK, sized in shares, booked at the walked average.
- Bundle unwinds weren't booked to the ledger → leg-risk losses invisible to
  the daily stop. Now booked.
- negRisk YES basket treated a paused candidate set as exhaustive → fake
  "guaranteed" arbs. Now requires the full listed outcome set.
- Maker inventory cap counted **hedged pairs** (locked profit) as risk → live
  quoting would silently stop. Now counts only unpaired inventory.

The tests in `tests/test_review_fixes.py` lock these in. **Don't loosen them.**

---

## 7. Test suite

```
tests/test_fees.py                6   fee curve, categories, overrides
tests/test_strategies.py         17   each strategy's fire/skip logic
tests/test_risk_and_portfolio.py 11   caps, dedupe, ledger, paper round-trip
tests/test_bot_integration.py     3   end-to-end scan→risk→fill cycles
tests/test_elevated.py           25   maker, depth, resting orders, settlement
tests/test_review_fixes.py       10   regressions for the 24 review findings
                                 ---
                                 72   all offline, ~0.3s
```

Run `python -m pytest tests/ -q` after every change. If you add a feature, add
a test in the same style (fixtures in `tests/conftest.py`).

---

## 8. Suggestion note — how I would continue this project

If I were picking this up on your machine, here is the **precise, ordered**
plan. Items are sequenced so each unblocks the next; do them in order.

### Phase 0 — Validate the live API (do this first, before ANY money)

**0.1 — Run `python -m polybot scan`.** This is the first real API call ever
made. If it fails, fix `api.py` against whatever the live response actually
looks like (the docs may have drifted). Success = it lists opportunities or
cleanly says none.

**0.2 — Verify data shapes.** Print a couple of raw Gamma market objects and
CLOB book responses and confirm `models.py`'s `from_gamma`/`from_clob` parse
them correctly (field names, JSON-string fields, sort order). This is the
highest-probability place for a live surprise.

**0.3 — Dry-run the live executor without real orders.** Install
`py-clob-client-v2`, point it at the API with a **funded test wallet holding
$5**, and place ONE tiny limit order well away from the market, then cancel it.
Confirm: order id comes back, `get_order` status parses, `cancel` works,
`sync_orders` reconciles. This validates `executor/live.py`'s assumptions about
the client's method names and response shapes (the review flagged these as
"unverifiable offline" — they become verifiable here).

### Phase 1 — Paper-trade for real signal (1–2 weeks)

**1.1** Leave `python -m polybot run` going for 7–14 days. Every day, run
`status` and log equity.

**1.2** Instrument the maker strategy: how often does it get *both* sides
filled vs. one-sided? That ratio is the whole ballgame for profitability.
Add a counter to `bot.py` and log it per cycle.

**1.3** Tune `config.yaml` from what you observe: if the maker never fills,
loosen `maker_min_spread`/`maker_min_capture`; if it's constantly one-sided and
stopping out, tighten `maker_mid_low/high` and shorten `maker_requote_ticks`.

### Phase 2 — Go live, tiny (only if paper looked sane)

**2.1** Fund $100 USDC on Polymarket, place one manual trade in the UI to
initialize approvals.

**2.2** Set `.env` (copy `.env.example`), set `POLYBOT_LIVE_ACK=I_UNDERSTAND_
THE_RISKS`, and run with a **deliberately conservative** `config.yaml`:
`max_trade_usdc: 3`, `maker_quote_usdc: 4`, `value_enabled: false` (arb + maker
only for the first week).

**2.3** `python -m polybot run --live`. Check `status` against your Polymarket
account page daily. Watch logs for `UNWIND FAILED` (a stuck position to close
manually) and any cancel/reservation warnings. After a clean week, restore
default caps and optionally re-enable the value strategy.

### Phase 3 — The roadmap (highest ROI first)

These are the concrete features to build next, in priority order. Each is
scoped as a discrete task a Claude Code session can take on.

1. **WebSocket book streaming** (`ws-subscriptions-clob.polymarket.com`).
   *Why:* the bot polls every 6–30s; competitors react in ~1s. Streaming order
   books turns the maker + arb strategies from "catch leftovers" into
   "competitive." *Where:* new `polybot/stream.py`; `bot.py` reacts to book
   deltas instead of (or alongside) the poll loop. **Biggest single
   profitability lever.**

2. **On-chain pair merge for live mode.** *Why:* live YES+NO maker pairs
   currently sit until resolution (capital locked); merging recycles the cash
   immediately. *How:* Polymarket's `NegRiskCtfExchange` / CTF `mergePositions`
   via web3, or Polymarket's newer unified `py-sdk` if it exposes it. *Where:*
   `executor/live.py._merge_maker_pairs` (currently a no-op in live).

3. **Maker rebate accounting.** *Why:* rebates are real income the bot doesn't
   currently track, so it *understates* its own edge. *How:* poll the rebate/
   rewards endpoint, credit it in `portfolio.py`, surface in `status`.

4. **Persistent metrics + a dashboard.** *Why:* you can't tune what you can't
   see. *How:* write per-cycle metrics (equity, fill ratio, per-strategy PnL)
   to a CSV/SQLite; a tiny local web page (reuse the repo's `packages/web`
   pattern) or even a Grafana feed.

5. **Smarter fair-value for the maker.** *Why:* it currently quotes around the
   book midpoint; a micro-price (size-weighted) or a short EMA reduces
   adverse-selection on one-sided flow. *Where:* `strategies/market_maker.py`.

6. **Cross-venue arbitrage vs. Kalshi.** *Why:* equivalent markets (elections,
   econ prints) sometimes diverge between venues — a larger, less-contested
   edge than intra-Polymarket arb. *Scope:* a new data client + a new strategy;
   the biggest new-surface item, do it last.

7. **Backtesting harness.** *Why:* to tune thresholds against history instead
   of live money. *How:* record `ScanResult`s to disk during paper runs, then
   replay them through the strategies offline. Turns Phase 1 tuning from
   "wait a week" into "replay in seconds."

### A word on expectations (keep this honest)

Realistic outcome on $100: **slow compounding with variance**, driven mostly
by the maker rebate edge and the occasional risk-free arb. Single-digit dollars
in a good month; flat or slightly negative in a quiet one. The risk manager
guarantees the downside is bounded, not that the upside exists every month.
Item #1 (streaming) is the difference between "educational" and "actually
competitive." Do not scale size up until you have several weeks of *live*
(not paper) data showing a positive, fee-and-rebate-inclusive edge.

---

## 9. Quick reference card

```
Setup:     py -m venv venv && venv\Scripts\Activate.ps1 && pip install -r requirements.txt
Test:      python -m pytest tests/ -q          # expect 72 passed
Scan:      python -m polybot scan              # FIRST live API call — do this first
Paper:     python -m polybot run               # simulated, no keys
Status:    python -m polybot status
Live:      set .env + POLYBOT_LIVE_ACK, then:  python -m polybot run --live
Config:    edit config.yaml (caps/thresholds); secrets go in .env
Branch:    claude/polymarket-trading-bot-i4idu4   (repo far-reach/Cryptonic)
```

**Golden rules:** never commit `.env` or `state/`; never loosen a test in
`test_review_fixes.py` without understanding the bug it guards; paper-trade
before live; start live at 1/3 size; the drawdown halt and daily stop are your
seatbelt — don't disable them.
