# Arbitrage detection — research notes and design

This document explains *why* the scanner in this package is built the way it is, what the
numbers it prints mean, and what it would take to go from "detect" to "trade". Read it before
trusting a single row of output.

## 1. What "arbitrage" means in crypto, concretely

Four families are worth detecting with public data. Everything else (MEV, latency arbitrage,
liquidation hunting) needs infrastructure this repo does not have.

| Family | Mechanism | Where the edge comes from | Typical net edge today |
|---|---|---|---|
| **Cross-exchange** | Buy an asset where its ask is low, sell it where its bid is high. | Fragmented liquidity; venue-specific flow; transfer frictions keep prices apart. | 0.01–0.1 % after fees, usually only during stress or when transfers are suspended. |
| **Triangular** | On one venue, cycle through three markets (USDT→ETH→BTC→USDT) and end with more than you started. | Stale quotes on the less liquid leg (usually the crypto/crypto pair). | Rare on major venues; shows up for seconds on thin ETH/BTC-style pairs. |
| **Spot/perp carry (basis)** | Hold spot, short the perpetual of equal size, collect funding every interval. | Perp longs pay to be levered; the position is delta-neutral. | 5–30 % APR in calm markets, 50–100 %+ briefly in euphoria. |
| **Funding spread** | Long the perp where funding is low, short it where it is high. | Venues' funding diverges because their trader populations differ. | A few % APR; occasionally large on new listings. |

Sources that shaped these choices: a 2026 Bellman-Ford study on single-exchange triangular
detection ([beei.org](https://beei.org/index.php/EEI/article/view/10817)); a 2026 master's
thesis that checks whether Binance triangular opportunities still exist one second later
([kse.ua](https://kse.ua/wp-content/uploads/2026/05/dmytro-golovenko_282366_assignsubmission_file_bfe25_master_thesis_draft_golovenko_v7.pdf));
a DEX paper on the limits of Moore-Bellman-Ford for loop finding
([arXiv 2406.16573](https://econpapers.repec.org/paper/arxpapers/2406.16573.htm)); a
university study reporting ~0.054 % average cross-exchange P&L
([PSU thesis](https://kb.psu.ac.th/psukb/bitstream/2016/19215/1/6330621002.pdf)); practitioner
write-ups on funding-rate carry and annualisation
([Sharpe](https://www.sharpe.ai/learn/funding-rate-arbitrage),
[Hypercall](https://docs.hypercall.xyz/docs/reference/basis-trades)); and autumn-2026 fee
comparisons ([Bitsgap](https://bitsgap.com/blog/bybit-binance-okx-where-your-bot-pays-less-in-2026),
[CryptoSlate](https://cryptoslate.com/crypto-exchanges/okx-vs-binance/)). The consistent
message across them: **gross gaps are common, net gaps are not**. A detector that ignores
fees, depth, and transfer cost will "find" opportunities all day and none of them will be real.

## 2. Design principles

1. **Every number is net of taker fees on every fill.** Market orders are the only way to
   capture a gap that may vanish in a second, and they pay the taker rate. Base-tier fees are
   built in (`src/fees.ts`); override with `ARB_FEES_JSON` for your tier.
2. **Size is a first-class output.** An edge that exists for $300 of SOL is not an edge. The
   top-of-book size caps the trade; with `--depth N` the top candidates are re-priced by
   walking real order books for the requested notional (`src/depth.ts`).
3. **Pre-funded and transfer modes are reported separately.** Cross-exchange arbitrage in
   practice means holding inventory on both venues and rebalancing occasionally. The
   `netAfterTransferBps` column shows what a one-off withdraw-and-redeposit would cost,
   including an estimated delay, so the reader can see that it almost never pays.
4. **Same ticker ≠ same asset.** Two tokens called "XYZ" on two venues, a wrapped vs native
   coin, or a halted market all show up as a huge "gap". Anything above the suspicious
   threshold (default 3 %) is quarantined into its own table instead of topping the list.
5. **Stale quotes are dropped.** A ticker older than 30 s relative to the freshest one in the
   set is excluded; a one-sided or crossed quote (ask < bid) is excluded.
6. **Public endpoints only.** No API keys, so it can run from a GitHub Actions runner, like the
   Bitget briefing bot in this repo. The container this was developed in cannot reach the
   exchanges, so every adapter has a pure `parse*` function with fixture tests.

## 3. The maths

### Cross-exchange
For a market quoted on venues *i* and *j*:

```
gross_bps = (bid_j − ask_i) / ask_i × 10 000
net_bps   = gross_bps − takerFee_i − takerFee_j
max_size  = min(askSize_i × ask_i, bidSize_j × bid_j)           (top of book)
```
With order books: `ask_i` becomes the volume-weighted average price of buying `notional`
worth, `bid_j` the VWAP of selling the base amount that bought. `max_size` becomes the
smaller side's total resting notional.

Transfer mode subtracts `withdrawFee_base / baseBought × 10 000` bps and reports the
expected minutes in transit; during that window the gap can close, so it is risk, not cost.

### Triangular
Build a directed graph per venue. Each market BASE/QUOTE yields two edges:

```
QUOTE → BASE   rate = (1 / ask) × (1 − fee)
BASE  → QUOTE  rate = bid × (1 − fee)
```
A cycle is profitable when the product of its rates exceeds 1. Two searches are provided:

* `findTriangles` enumerates every 3-cycle from the start currencies (USDT, USDC). It is
  exhaustive, deterministic and ranks all candidates. Triangles are where real single-venue
  edge lives because every extra leg costs another taker fee.
* `bellmanFordCycle` runs Bellman-Ford on weights `w = −ln(rate)`; a negative cycle is an
  arbitrage of any length. It returns one cycle (the first found), so it is a safety net for
  4+ leg loops rather than a ranking tool. Its limitations are discussed in arXiv 2406.16573.

Size: each leg's top-of-book capacity is translated back to the start currency and the
minimum is reported as `maxNotionalStart`.

### Spot/perp carry
```
grossAPR%  = |fundingRate| × (8 760 / intervalHours) × 100
feesBps    = 2 × (spotTaker + perpTaker)                          (open + close, both legs)
netAPR%    = grossAPR% − (feesBps / 100) × (365 / holdDays)
breakeven  = feesBps / (|fundingRate| × 10 000) × intervalHours  (hours of funding to repay fees)
basisBps   = (perpPrice − spotPrice) / spotPrice × 10 000
```
Funding > 0 → long spot / short perp (anyone can do it). Funding < 0 → short spot / long
perp, which needs borrowable spot; it is reported with a warning. The basis is shown, not
counted: on a perpetual it mean-reverts through funding rather than converging at an expiry.
Intervals matter: Bitget and Bybit publish them per contract, Binance lists the non-8 h ones
in `fundingInfo`, OKX's is derived from `fundingTime`/`nextFundingTime`.

### Funding spread
`spread = funding_short − funding_long`, annualised the same way, fees are perp taker on
four fills. Only contracts settling on the same interval are compared.

## 4. Data sources (all unauthenticated)

| Venue | Spot top-of-book | Perp top-of-book + funding | Order book | Withdrawal fees |
|---|---|---|---|---|
| Bitget | `/api/v2/spot/market/tickers` | `/api/v2/mix/market/tickers?productType=USDT-FUTURES` + `/contracts` for `fundInterval` | `/api/v2/spot/market/orderbook` | `/api/v2/spot/public/coins` (live) |
| Binance | `/api/v3/ticker/bookTicker` | `fapi/v1/premiumIndex` + `fapi/v1/ticker/bookTicker` + `fapi/v1/fundingInfo` | `/api/v3/depth` | auth only → defaults |
| Bybit | `/v5/market/tickers?category=spot` | `…?category=linear` + `instruments-info` | `/v5/market/orderbook` | auth only → defaults |
| OKX | `/api/v5/market/tickers?instType=SPOT` | `…?instType=SWAP` + `/api/v5/public/funding-rate?instId=ANY` | `/api/v5/market/books` | auth only → defaults |

One scan is ~12 requests plus 2 per depth-checked candidate: far inside every venue's public
rate limit. Endpoint shapes are encoded in `src/venues/*.ts`; if a venue changes a field name
the fixture test for that parser is the place to update.

## 5. Known gaps and how to close them (roadmap)

1. **Snapshot, not stream.** REST tickers are seconds old by the time they are compared.
   Real detection needs WebSocket book feeds per venue and a synchronised local book; the
   detectors here are pure functions over `Quote[]`/`OrderBook` so they can be driven by a
   stream unchanged.
2. **Persistence test.** The literature's best predictor of whether a triangular gap is
   capturable is whether it still exists ~1 s later. Log every detected opportunity with a
   second snapshot a few seconds after and measure survival. `--json` output is designed for
   this; a small SQLite/CSV logger is the next step.
3. **Backtest before trading.** Record a week of quotes, replay through the detectors, and
   compute the realised P&L of hypothetical fills with the slippage model. Compare against
   simple benchmarks (hold USDT). Without this, "net APR 60 %" is a number, not a result.
4. **Fee tiers and rebates.** Real accounts have better tiers than base; load the account's
   actual schedule. Maker-leg execution (post one side) halves fees but adds leg risk.
5. **Deposit/withdraw status.** A transfer-suspended asset is exactly where cross-exchange
   gaps appear and exactly where they cannot be captured. The Bitget briefing bot already
   detects suspension notices; cross-referencing its `arb-watch` signals with this scanner
   would separate "gap because transfers are frozen" from "gap you can act on".
6. **Asset identity.** Map tickers to contract addresses / chains per venue so the suspicious
   filter becomes a hard check instead of a threshold.
7. **Execution.** Not in scope here. If added: pre-funded inventory on both venues,
   simultaneous IOC orders, hard max-notional, kill switch on repeated partial fills, and
   never a withdrawal in the hot path.
8. **Risk for carry trades.** Funding resets every interval and can flip sign; the perp leg
   is leveraged, so margin must be monitored. Treat net APR as the current run-rate, not a
   promise.

## 6. How to read a report

* **Cross-exchange rows with net > 0 and max size ≫ your notional, depth = book:** worth
  watching live. If `net after transfer` is negative (it almost always is), you need
  inventory on both venues first.
* **Triangular rows:** usually gone within a second on big venues; if they persist across
  scans, suspect a stale or halted market rather than a free lunch.
* **Carry rows:** the most robust family for a non-HFT participant. Check "fees back in":
  if that is longer than you expect funding to stay elevated, skip it.
* **Suspicious table:** do not trade these. They are the most common way a naive scanner
  loses money.
