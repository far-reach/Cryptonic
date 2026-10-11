# @veil/arbitrage

Snapshot scanner that looks for **arbitrage opportunities** across Bitget, Binance, Bybit and
OKX using only their public endpoints, and reports them **net of fees, sized by real depth**:

| Detector | What it finds |
|---|---|
| 🔁 Cross-exchange | Buy at venue A's ask, sell at venue B's bid, same market. Pre-funded and transfer modes. |
| 🔺 Triangular | USDT → X → Y → USDT loops on one venue (exhaustive 3-cycles + Bellman-Ford for longer loops). |
| 💸 Spot/perp carry | Long spot / short perp collecting funding, with break-even hours and net APR. |
| ⚖️ Funding spread | Long the perp on the low-funding venue, short it on the high-funding one. |

Three commands, in the order you should use them:

| Command | What it does |
|---|---|
| `arb-scan` | One snapshot report (the tables above). |
| `arb-scan paper` | Scan, wait a few seconds, re-price what it found at fresh quotes, append to a ledger, track paper carry positions, and compute the **go-live gate**. Scheduled every 30 min by `.github/workflows/arbitrage-paper.yml`, ledger committed under `arbitrage/`. |
| `arb-scan trade` | Execute the best cross-exchange row as two IOC limit orders. **Dry-run by default**; live only with `--live`, `ARB_LIVE=I_ACCEPT_THE_RISK`, API keys, and a passed gate. |

Why these, how the maths works, what the live run showed, and the go-live checklist are
in [`docs/design.md`](docs/design.md). **Read it first**: most "arbitrage" a naive scanner
finds is a fee illusion, a symbol collision, or a frozen market, and no real order has
been sent from this code yet.

## Usage

```bash
# from the repo root
npm install --workspaces

# live scan (needs ordinary internet; some CI sandboxes can't reach the exchanges,
# and Binance/Bybit geo-block GitHub's US runners)
npm run arb

# synthetic snapshot with planted opportunities, no network
npm run arb -- --demo

# paper-trading step (ledger in ./arbitrage-paper by default)
npm run arb:paper -- --depth 10
npm run arb:paper -- --demo

# dry-run the best cross-exchange row (prints the orders it would send)
npm run arb:trade -- --state-dir arbitrage

# tests / typecheck
npm run test:arb
npm run typecheck:arb
```

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--venues bitget,okx` | all four | Venues to read. |
| `--quotes USDT,USDC` | `USDT,USDC` | Quote currencies to compare; also the triangular start currencies. |
| `--notional 1000` | `1000` | Quote-currency size per leg that fees, slippage and transfer costs are computed for. |
| `--min-net-bps 5` | `0` | Hide cross-exchange / triangular rows below this net edge. |
| `--min-apr 5` | `5` | Hide carry / funding-spread rows below this net APR (%). |
| `--hold-days 30` | `30` | Horizon over which carry entry/exit fees are amortised. |
| `--depth 5` | `0` | Re-price the top N cross-exchange rows with full order books. |
| `--json` / `--text` | markdown | Output format. `--json` is the ScanResult, meant for logging/backtests. |
| `--quiet` | — | Print nothing (exit 0) when nothing clears the thresholds. |

`paper` adds `--state-dir DIR` (default `arbitrage-paper`), `--verify-after 5` (seconds
before re-pricing) and `--carry-min-apr 15`. `trade` adds `--state-dir DIR` (must be the
paper ledger's directory: the gate reads it; `trades.jsonl` and the `HALT` kill switch
live there too), `--live`, `--max-notional 200` and `--slippage-bps 3`.

### Env

| Var | What |
|---|---|
| `ARB_OUTPUT` | Also write the markdown report to this file. |
| `ARB_FEES_JSON` | Override base-tier fees, e.g. `{"bitget":{"spotTakerBps":8,"perpTakerBps":4}}`. |
| `GITHUB_STEP_SUMMARY` | Set by GitHub Actions; the report is appended to the job summary. |
| `<VENUE>_API_KEY` / `_API_SECRET` / `_API_PASSPHRASE` | Trade-only keys for `trade --live` (passphrase: Bitget, OKX). Never commit them. |
| `ARB_LIVE` | Must equal `I_ACCEPT_THE_RISK` for any real order. |
| `ARB_OVERRIDE_GATE` | `1` bypasses a failing paper gate; recorded in the trade report. |

### Library

```ts
import { scan, findCrossExchange, findTriangles, findBasis, renderMarkdown } from "@veil/arbitrage";

const result = await scan({ venues: ["bitget", "binance"], notionalQuote: 2_000, depthTop: 3 });
console.log(renderMarkdown(result));
```

The detectors are pure functions over normalised `Quote[]` / `PerpQuote[]` / `OrderBook`
inputs, so they can be fed from a WebSocket stream or a recorded dataset without change.

## Scheduled runs

* `.github/workflows/arbitrage-scan.yml` — one-off report on manual dispatch and whenever
  this package changes (job summary + artifact).
* `.github/workflows/arbitrage-paper.yml` — the paper trader every 30 minutes; commits
  `arbitrage/ledger.jsonl`, `state.json` and `summary.md`. The summary's **Go-live gate**
  section is the answer to "has it proven it can make money yet".

> Research prototype. Reports are snapshots, not trade instructions; nothing here places
> orders.
