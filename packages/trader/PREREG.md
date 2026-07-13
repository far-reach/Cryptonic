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

## Promotion gates (in order, none skippable)

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
