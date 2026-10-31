# Paper-trading ledger — 2026-10-31 11:10 UTC

94 runs over 16.82 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 81 | 89% | +71.9 | +62.0 | +44.1 | +$502.59 |
| Cross-exchange (24 h) | 10 | 100% | +120.2 | +125.4 | +87.8 | +$125.40 |
| Cross-exchange (7 d) | 30 | 97% | +80.3 | +80.7 | +57.9 | +$241.99 |
| Triangular (all) | 22 | 100% | +38.9 | +39.6 | +25.3 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 62 | 97% | +81.4 | +81.2 | +63.6 | +$503.42 |
| okx→bitget | 8 | 63% | +45.8 | +6.6 | -57.5 | +$5.27 |
| binance→okx | 2 | 50% | +84.5 | +40.5 | -211.3 | +$8.09 |
| binance→bybit | 2 | 100% | +32.1 | +30.5 | +20.2 | +$6.10 |
| bitget→bybit | 2 | 100% | +29.1 | +29.3 | +16.7 | +$5.87 |
| okx→bybit | 1 | 0% | +32.8 | -184.7 | n/a | −$18.46 |
| bybit→bitget | 1 | 0% | +32.3 | -62.9 | n/a | −$6.29 |
| okx→binance | 1 | 100% | +27.2 | +27.7 | n/a | +$2.77 |
| binance→bitget | 1 | 0% | +21.8 | -47.6 | n/a | −$4.76 |
| bybit→okx | 1 | 100% | +6.2 | +5.8 | n/a | +$0.58 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 3 | 33% | −$1.15 | −$54.47 | −$9.40 | **−$65.02** | +$25.29 | 222 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 22 verified samples (need 30)
- **carry**: ⛔ not yet — only 3 closed paper positions (need 10); cumulative closed P&L is -65.02 (need > 0); win rate 33% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
