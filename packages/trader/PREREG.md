# Pre-registration — BTCUSDT spot grid, 250 USDT

Written 2026-07-13, BEFORE any live deployment. These criteria are **LOCKED**: apply
them as written. If results are bad, the answer is HALT + framework-level investigation
— not tuning thresholds until the verdict changes.

## Hypothesis (one sentence)

In the current ranging regime (BTC ~$64k, ~53% off ATH, bear/chop per
`docs/market-research-2026.md`), BTCUSDT crosses ~1.5%-spaced grid levels inside its
30-day range often enough that buy→sell round-trips netting ~+1.3% per ~22 USDT slot
after fees produce a positive monthly return, with downside bounded by the grid stop.

## Success criteria (measured, not vibes)

After **30 days on mainnet**:

- Realized PnL **> 0 USDT after fees** (from the state file / `status`, cross-checked
  against Binance trade history), AND
- **≥ 20 completed round-trips** (fewer means the range was wrong, not the mechanism), AND
- Max equity drawdown **< 10%**, AND
- Zero unexplained divergence between bot accounting and exchange balances.

Stretch (what "working well" looks like): ≥ +3%/month in choppy conditions.

## Kill criteria (any one → act, no debate)

1. **Equity < 212.50 USDT (−15%) at any moment** → halt permanently; post-mortem before
   any restart.
2. **Emergency stop fires** (price 10% under grid floor) → do NOT redeploy on a new
   range without a written note explaining why the new range is justified.
3. **Two consecutive 30-day windows net negative** → kill the strategy; the regime
   hypothesis is falsified.
4. **Unexplained accounting divergence > 1 USDT** between state file and exchange →
   halt until root-caused (this class of bug produced silently-wrong PnL for the
   sibling project).

## Amendment 1 (2026-07-13, before any gate data exists)

Gates 2 (paper) and 3 (testnet) run **in parallel** instead of sequentially, to meet an
operator-set go-live target of 2026-07-31. Rationale: the two gates validate independent
layers — paper validates the *strategy* (round-trip frequency and PnL vs expectation, on
simulated fills), testnet validates the *mechanics* (real order lifecycle, resume,
reconciliation) — so overlapping them does not weaken either evidence base. Both windows'
durations, criteria, and the mainnet entry conditions are unchanged. This amendment is
made before any paper/testnet data exists and therefore cannot be results-driven. The
go-live date remains conditional: **if either gate fails, the date moves; the criteria
do not.**

## Amendment 2 (2026-07-13, operator decision)

The operator has directed a compressed schedule: testnet wraps after a **24-hour
intensive window** (2026-07-13 → 07-14) and mainnet launches immediately after,
**waiving the 14-day paper window and the 7-day testnet window**. Recorded honestly:
this weakens the evidence base and is an operator risk-acceptance, not a criteria pass.
Mitigations, which are conditions of this amendment:

1. **Reduced launch size:** mainnet starts with **BTCUSDT only at 100 USDT** (40% of
   budget), not 250. ETHUSDT (75) and SOLUSDT (75) grids may start only after
   **7 clean mainnet days AND ≥ 5 profitable round-trips** on the BTC grid.
2. **Gate 1 must still pass, validly.** The 2026-07-13 "real-data" backtest
   (+73.96%) is **INVALIDATED**: its candles came from the testnet endpoint, whose
   thin-book price history is not real market data (root cause: fetch-data followed
   the trading baseUrl; fixed same day — market data now always comes from
   data-api.binance.vision). Gate 1 must be re-run on mainnet data before launch.
3. **The 24-hour testnet window must include, at minimum:** ≥ 1 observed fill,
   1 restart-resume drill, 1 kill-switch drill, and zero reconciliation mismatches.
4. **All kill criteria remain absolute and unchanged** (scaled to deployed capital:
   the −15% floor applies to the 100 USDT tranche, i.e. halt below 85 USDT equity).
5. The success evaluation window (30 days) starts at mainnet launch and is unchanged.

## Amendment 3 (2026-07-13, operator decision): multi-asset scope

Target universe expands beyond BTCUSDT toward top-traded Binance spot pairs
(stablecoins excluded). Constraint acknowledged by all parties: **250 USDT funds at
most 3 concurrent grids** (each grid needs ~8 slots × ≥ 6 USDT above the exchange
minimum-notional). Approved fleet at current capital: BTC (100) + ETH (75) + SOL (75),
one bot instance per symbol, phased in per Amendment 2. Wider expansion (next symbols
by 30-day quote volume, one grid per ~75–100 USDT of *new* capital or realized profit)
requires the 30-day success evaluation to pass first. Per-symbol grids follow the same
locked parameters and risk profile; no new strategy classes.

## Promotion gates (per Amendment 1: gate 2 and 3 concurrent; per Amendment 2: compressed by operator direction)

1. **Backtest** — on ≥ 30 days of real downloaded 1h candles: positive realized PnL,
   no emergency stop. ✅ synthetic passed 2026-07-13; real-data run pending (needs
   network access from the operator's machine).
2. **Paper** (live prices, simulated orders) — **≥ 14 days**: ≥ 10 round-trips, PnL
   within 2× of the backtest's per-round-trip expectation, at least one clean
   restart-resume.
3. **Testnet live** — **≥ 7 days**: real order lifecycle observed (place, fill,
   cancel, resume after restart), zero orphaned orders, reconciliation clean.
4. **Mainnet** — full 250 USDT (budget is already small; splitting it starves slots
   below min-notional). Dedicated sub-account, trade-only API key, IP allowlist.

## Not permitted (anti-overfitting, locked)

- No changing `grid.levels`, range width, or risk limits in response to a losing week.
  Parameter changes require: halt → written rationale → restart pipeline at paper.
- No manual trades in the bot's sub-account (the sibling project's ledger: manual
  "hunch" trades lost 35× what the systematic side made).
- No leverage, futures, or new strategy classes bolted onto this deployment.
- Re-ranging the grid is allowed only when price has **closed outside the range for
  ≥ 3 days** — and is a fresh deployment of the same locked parameters, not a tune.
