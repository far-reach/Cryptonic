# Project memory

## Autotrader (`packages/trader`) — THE GOAL

**The only goal: a profitable auto-trader on the user's Binance account, live as soon
as safely possible.** Everything in `packages/trader` serves that. Do not drift into
side quests (dashboards, multi-strategy, ML) until the bot is live and measurably
profitable.

Standing decisions (made 2026-07-13, don't re-litigate):

- **Strategy: spot grid on BTCUSDT, no leverage, no futures.** Right risk shape for the
  250 USDT budget. A sibling agent ("Janus", funding-rate perp trader) independently
  agreed: don't bolt other signal classes onto the grid.
- **Pipeline is fixed: backtest → paper → testnet → mainnet.** Promotion criteria are
  pre-registered in `packages/trader/PREREG.md` and are LOCKED — apply them, don't
  re-tune them after seeing results. No skipping stages ("skip shadow this once" is a
  named anti-pattern).
- **Never add manual-override paths to live trading.** The kill switch (env flag /
  `trader.kill` file) is the only intervention. If it's losing: halt and investigate at
  the framework level; do not tune parameters mid-flight.
- **Secrets only via env vars; API keys trade-only (no withdrawals), ideally a
  sub-account.** Mainnet requires `TRADER_LIVE_ACK=I_ACCEPT_FULL_RISK_OF_LOSS`.
- Adopted from Janus's postmortem (2026-07-13): kill switch, heartbeat ping, halt
  alerts, hourly-ish balance reconciliation, pre-registration discipline. Rejected as
  N/A: futures mechanics, their symbols/tiers, Bitget-specific fixes.

**Deadline: fully operational (mainnet live) by 2026-07-31** — dated plan in
`packages/trader/ROADMAP.md`. PREREG Amendment 1 runs the paper and testnet windows in
parallel to meet it. The deadline never overrides a gate: if a gate fails, the date
slips, not the criteria.

Status update 2026-07-13 (evening): operator completed setup and testnet is live.
Operator directed (PREREG Amendments 2 & 3): 24h testnet wrap → mainnet ~2026-07-15 at
reduced size (BTC-only, 100 USDT), scaling to a BTC/ETH/SOL fleet (100/75/75, one
process per symbol via configs/ + trader@.service) after 7 clean days + ≥5 profitable
round-trips. Wider "top-100" expansion rejected at current capital: a grid costs
~75–100 USDT (min-notional math), so 250 USDT funds ≤ 3 grids. **The operator's
2026-07-13 backtest showing +73.96% was INVALIDATED — candles came from the testnet
endpoint (fixed: `binance.dataUrl` now always serves market data from
data-api.binance.vision). Do not cite that number; Gate 1 re-run on real data is
required before launch.** Kill criteria remain absolute, scaled to deployed capital.

Update 2026-07-13 (late): operator directed immediate mainnet launch (PREREG Amendment
4) at small capital with an absolute −50 USDT hard stop, now enforced in code
(`risk.maxTotalLossQuote`, checked against realized + marked-to-market PnL every tick;
breach = cancel, liquidate, permanent halt). "Small caps" = small capital, NOT
small-cap coins — tiny coins stay excluded.

Update 2026-07-13 (later): venue switched to **Bitget sub-account** (PREREG Amendment
5) — operator has one funded. `src/bitget.ts` adapter (v2 spot API, HMAC-base64 +
passphrase) behind the same Exchange interface; venue dispatch in `src/venue.ts`;
`"exchange": "bitget"` in config. Bitget has NO spot testnet → mandatory canary:
`configs/bitget-BTCUSDT-canary.json` (30 USDT, −15 stop) for 24–48h with drills, then
`configs/bitget-BTCUSDT.json` (100 USDT, −50 stop). TRADER_LIVE_ACK required for ANY
bitget live run. Binance path still works and remains the default.

When resuming work here: read `packages/trader/PREREG.md` first, check which pipeline
stage we're in (ROADMAP.md phases), and advance it.
