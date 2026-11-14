# Paper-trading ledger — 2026-11-14 09:21 UTC

147 runs over 30.74 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 126 | 90% | +69.0 | +62.6 | +48.3 | +$788.24 |
| Cross-exchange (24 h) | 2 | 100% | +4.3 | +2.8 | +0.7 | +$0.55 |
| Cross-exchange (7 d) | 26 | 92% | +68.9 | +67.9 | +36.8 | +$176.60 |
| Triangular (all) | 24 | 100% | +36.6 | +37.2 | +23.7 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 86 | 97% | +61.0 | +60.9 | +46.5 | +$523.89 |
| okx→bitget | 29 | 83% | +104.7 | +93.3 | +57.0 | +$270.45 |
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
| 10 | 12 | 67% | +$83.73 | −$69.32 | −$36.80 | **−$22.39** | +$4.53 | 495 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 24 verified samples (need 30)
- **carry**: ⛔ not yet — cumulative closed P&L is -22.39 (need > 0)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
