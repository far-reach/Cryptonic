# @veil/arbitrage

Snapshot scanner that looks for **arbitrage opportunities** across Bitget, Binance, Bybit and
OKX using only their public endpoints, and reports them **net of fees, sized by real depth**:

| Detector | What it finds |
|---|---|
| 🔁 Cross-exchange | Buy at venue A's ask, sell at venue B's bid, same market. Pre-funded and transfer modes. |
| 🔺 Triangular | USDT → X → Y → USDT loops on one venue (exhaustive 3-cycles + Bellman-Ford for longer loops). |
| 💸 Spot/perp carry | Long spot / short perp collecting funding, with break-even hours and net APR. |
| ⚖️ Funding spread | Long the perp on the low-funding venue, short it on the high-funding one. |

Why these, how the maths works, and what it would take to trade on the output are in
[`docs/design.md`](docs/design.md). **Read it first**: most "arbitrage" a naive scanner
finds is a fee illusion, a symbol collision, or a frozen market.

## Usage

```bash
# from the repo root
npm install --workspaces

# live scan (needs ordinary internet; some CI sandboxes can't reach the exchanges)
npm run arb

# synthetic snapshot with planted opportunities, no network
npm run arb -- --demo

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

### Env

| Var | What |
|---|---|
| `ARB_OUTPUT` | Also write the markdown report to this file. |
| `ARB_FEES_JSON` | Override base-tier fees, e.g. `{"bitget":{"spotTakerBps":8,"perpTakerBps":4}}`. |
| `GITHUB_STEP_SUMMARY` | Set by GitHub Actions; the report is appended to the job summary. |

### Library

```ts
import { scan, findCrossExchange, findTriangles, findBasis, renderMarkdown } from "@veil/arbitrage";

const result = await scan({ venues: ["bitget", "binance"], notionalQuote: 2_000, depthTop: 3 });
console.log(renderMarkdown(result));
```

The detectors are pure functions over normalised `Quote[]` / `PerpQuote[]` / `OrderBook`
inputs, so they can be fed from a WebSocket stream or a recorded dataset without change.

## Scheduled run

`.github/workflows/arbitrage-scan.yml` runs the scanner on manual dispatch and whenever this
package changes, writing the report to the job summary and uploading it as an artifact. Add a
`schedule:` block if you want it periodic; it only reads public endpoints.

> Research prototype. Reports are snapshots, not trade instructions; nothing here places
> orders.
