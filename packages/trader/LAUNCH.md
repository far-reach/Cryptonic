# LAUNCH — from zero to live on Bitget (Windows)

The complete operator path, in order. Assumes nothing. Current plan (PREREG Amendments
2–5): **canary first** — 30 USDT with a −15 hard stop for 24–48h — then scale to
100 USDT with the −50 hard stop.

## A. Get the code (once, ~5 min)

Open **PowerShell** and run, line by line:

```powershell
cd $HOME
git clone -b claude/binance-autotrader-bot-r59wdw https://github.com/far-reach/Cryptonic.git
cd Cryptonic\packages\trader
npm install
npm run build
npx vitest run        # expect: all tests pass
```

Already cloned before? Just update instead:

```powershell
cd $HOME\Cryptonic\packages\trader
git pull
npm install
npm run build
```

Sanity check you have the protected build — this must print a line:

```powershell
findstr maxTotalLossQuote configs\bitget-BTCUSDT-canary.json
```

## B. Keep the PC awake (once, 1 min)

The bot dies when Windows sleeps. As Administrator:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

(Screen can still turn off; that's fine.)

## C. Bitget sub-account + API key (once, ~10 min)

1. Log in at **bitget.com** → profile icon → **Sub-accounts**. Create (or pick) a
   sub-account used by NOTHING else — no manual trades, no other bots, ever.
2. Transfer **30 USDT** into that sub-account's **Spot** wallet (this is the canary
   budget; the rest stays in your main account for now).
3. **API Management** for that sub-account → **Create API Key** → type **HMAC**
   ("system-generated"), not RSA.
4. Invent and note the **passphrase** (a small extra password — the bot needs it).
5. Permissions: **Read** ✅, **Spot Trade** ✅. Withdrawals / transfers / futures ❌.
6. Optional but good: IP whitelist = your home IP (google "what is my IP").
7. Copy the **API Key** and **Secret** (secret is shown ONCE) plus your passphrase
   into a password manager. Never into chat, email, or files in this folder.

## D. Pre-flight backtest (2 min — the go/no-go sanity gate)

```powershell
node dist\cli.js fetch-data --interval 1h --candles 720 --config configs\bitget-BTCUSDT-canary.json
node dist\cli.js backtest --csv BTCUSDT-1h.csv
```

GO = `realized profit` positive (single digits %, small numbers are normal) and
`emergency stop no`. NO-GO = loss or stop fired → don't launch; the market recently
trended too hard for a grid; re-check in a few days.

## E. Launch the canary (real money, tiny size)

In the same PowerShell window (set-commands live only in that window, which is good):

```powershell
$env:BITGET_API_KEY = "PASTE-KEY"
$env:BITGET_API_SECRET = "PASTE-SECRET"
$env:BITGET_API_PASSPHRASE = "PASTE-PASSPHRASE"
$env:TRADER_LIVE_ACK = "I_ACCEPT_FULL_RISK_OF_LOSS"
node dist\cli.js live --config configs\bitget-BTCUSDT-canary.json
```

Healthy first lines look like:

```
auto-range from 30d real klines (bitget): 5xxxx.xx – 6xxxx.xx
LIVE mode on BTCUSDT @ https://api.bitget.com (bitget) — budget 30 USDT, 5 levels, ~6.75 USDT/slot
2026-07-1xT..Z px=6xxxx.xx TRADE placed=2 fills=0 realized=0.0000 equity=30.00
```

Leave the window open. The bot polls every 30s; most ticks show `placed=0 fills=0` —
that's normal resting-order behavior, not a freeze.

## F. During the 24–48h canary — drills (required)

| When | Drill | Pass looks like |
|---|---|---|
| after first fill | **Restart**: Ctrl-C, rerun the `live` command (re-set the 4 `$env:` lines first) | "resuming from ..." and your orders still on the book |
| any time | **Kill switch**: create an empty file `trader.kill` in the folder | bot exits within 30s; delete file, restart |
| hour 24 | `node dist\cli.js gates --config configs\bitget-BTCUSDT-canary.json` | send the output for review |

Watch for: any `Bitget ... code 4xxxx` line (copy it out — that's a venue quirk to
fix), any `RECONCILE MISMATCH` (halt-worthy), and whether a full round-trip
(`round-trip grid-sell-x: +0.0xxx USDT`) completes.

## G. Scale-up (after a clean canary)

1. Stop the canary (Ctrl-C). 2. Transfer the sub-account to **100 USDT** total.
3. Same launch command, config `configs\bitget-BTCUSDT.json` (100 USDT, −50 hard stop).
4. After 7 clean days + ≥5 profitable round-trips: add ETH/SOL grids per PREREG
   Amendment 3 (needs capital beyond the first 100).

## H. Daily operation

- Check-in: `node dist\cli.js status --config <config>` (second window) or read the log.
- Weekly: `gates` output → review vs PREREG.
- Optional alerts to your phone: free check at healthchecks.io →
  `$env:TRADER_HEARTBEAT_URL="https://hc-ping.com/<uuid>"` before launching.
- **Never** trade manually in the bot's sub-account; **never** edit grid/risk settings
  while it runs. Intervention = kill switch, then talk it through.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `refusing real-money live trading` | `TRADER_LIVE_ACK` not set in THIS window — re-run the `$env:` lines |
| `missing Bitget credentials` | same — env vars are per-window |
| `Bitget ... code 40037/40012` | API key wrong/permissions missing — recheck step C.5 |
| `Bitget ... code 40018` | IP whitelist doesn't include your current IP |
| sign errors mentioning timestamp | clock drift — bot auto-syncs at start; restart it |
| bot idle for hours, price above range | by design: grid waits for price to re-enter; see PREREG re-range rule |
| `EMERGENCY STOP` in log | risk system fired: it liquidated and halted. Read the reason, then review together before ANY restart |
