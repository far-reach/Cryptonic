# R&D Roadmap — Binance autotrader, operational by 2026-07-31

Written 2026-07-13. Working back from the deadline: mainnet go-live **Friday 2026-07-31**,
conditional on the pre-registered gates in [`PREREG.md`](PREREG.md) (as amended) passing.
**The deadline never overrides a gate or kill criterion — if a gate fails, the date slips
and PREREG says why.** "Portable" = the bot runs identically on any Docker host or
systemd Linux box from one env file; no machine-specific state beyond `trader-state.json`.

## Who does what

- **Agent (me):** all code, tests, packaging, docs, analysis of results.
- **Operator (you):** anything requiring real-world identity/custody — accounts, API keys,
  funding, VPS rental — plus running commands where Binance is network-reachable (this
  sandbox cannot reach Binance; that constraint shapes the split below).

## Phases

### Phase 0 — Core bot (DONE, 2026-07-13)
Grid engine + risk manager + paper/backtest/live modes, 23 tests, ops hardening (kill
switch, heartbeat, alerts, reconciliation), PREREG discipline. ✅

### Phase 1 — Portability & readiness kit (me, 2026-07-13) ✅
- Dockerfile + compose file (state volume, env file, auto-restart) — image verified locally.
- systemd unit + one-shot VPS setup script for the non-Docker path.
- `.env.example` documenting every runtime variable.
- `gates` CLI command: evaluates PREREG gate progress mechanically from the state file,
  so checkpoint reviews are arithmetic, not judgment calls.
- PREREG Amendment 1 (below): paper and testnet windows run in parallel.

### Phase 2 — Operator setup + Gate 1 (you, target 2026-07-14 → 07-15)
1. Rent a small VPS (e.g. Hetzner CX22 ~€4/mo, Ubuntu 24.04) — or any always-on Linux box.
2. `git clone` the repo; run `packages/trader/deploy/setup-vps.sh` (or `docker compose up`).
3. Create a **testnet** key at testnet.binance.vision (free, instant).
4. Create a free healthchecks.io check; put its URL in `.env` (heartbeat + missed-tick alerts).
5. **Gate 1 (backtest on real data):**
   `cryptonic-trader fetch-data --interval 1h --candles 720` then `backtest --csv`.
   Pass = positive realized PnL, no emergency stop (criteria locked in PREREG).
   Paste me the output — I analyze, you don't need to interpret it.

### Phase 3 — Parallel validation windows (2026-07-15 → 07-29)
Two independent layers validated concurrently (Amendment 1):
- **Paper mode** on the VPS (strategy evidence): 14 days, target ≥ 10 round-trips with
  per-trip PnL within 2× of backtest expectation (~+0.30 USDT).
- **Testnet live** (mechanics evidence): 7+ days with real order lifecycle — fills,
  cancel/replace, ≥ 1 deliberate restart-resume (~07-20), ≥ 1 kill-switch drill,
  clean reconciliation throughout.
- **Checkpoints: 07-19 and 07-26** — run `cryptonic-trader gates`, send me the output.
  I produce a written verdict against PREREG each time.
- Meanwhile (me, as results arrive): analyze fills, fix mechanics bugs found on testnet
  (bug fixes to execution are allowed mid-window; *strategy parameter changes are not*).

### Phase 4 — Go/no-go + mainnet prep (2026-07-29 → 07-30)
1. Final `gates` run → written go/no-go against PREREG. **No-go = new date, not a waiver.**
2. If GO, operator: create Binance **sub-account**, transfer exactly 250 USDT, create API
   key (Reading + Spot Trading only, **no withdrawals**, IP-locked to the VPS), buy ~2 USDT
   of BNB for the fee discount.
3. Dry-run config review (me): mainnet `baseUrl`, grid range vs current price, state file
   path, alerts wired.

### Phase 5 — Go-live (2026-07-31)
Start live mode with `TRADER_LIVE_ACK` set, under systemd/Docker restart policy.
First 48h: heartbeat green, first fills reconciled, daily `status` review.
**Operational ≠ finished:** the 30-day success evaluation (PREREG) lands ~2026-08-30 —
PnL > 0 after fees, ≥ 20 round-trips, < 10% drawdown, clean books.

## Post-live R&D backlog (strictly after go-live; order of value)
1. Exact fee accounting from `myTrades` (replace the conservative 0.1% assumption).
2. Trailing grid re-range with the 3-day-close-outside confirmation rule (PREREG-gated).
3. Nightly digest → Telegram/webhook (extend the existing alert plumbing).
4. WebSocket user-data stream (only if REST polling proves limiting — it likely won't).
Named non-goals until profitability is proven: dashboards, multi-pair, ML, futures.

## Standing risks
- **Range exit** (BTC breaks out of the 30d range): bot idles (above) or stops (below) by
  design; re-range only per PREREG rule. This is the most likely "why is it doing nothing".
- **Regime shift to strong trend**: grid underperforms; kill criteria bound the damage.
- **Timeline**: Phase 2 slipping >2 days pushes go-live day-for-day; testnet mechanics
  bugs found late in Phase 3 push go-live until 7 clean days accumulate after the fix.
