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

When resuming work here: read `packages/trader/PREREG.md` first, check which pipeline
stage we're in, and advance it.
