# Paper-trading ledger — 2026-11-18 09:03 UTC

161 runs over 34.73 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 130 | 91% | +68.2 | +62.0 | +48.1 | +$806.12 |
| Cross-exchange (24 h) | 2 | 100% | +10.7 | +11.5 | +5.3 | +$2.29 |
| Cross-exchange (7 d) | 11 | 91% | +18.7 | +18.9 | -0.6 | +$20.75 |
| Triangular (all) | 24 | 100% | +36.6 | +37.2 | +23.7 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 89 | 97% | +60.7 | +60.8 | +46.7 | +$540.94 |
| okx→bitget | 30 | 83% | +101.4 | +90.4 | +55.0 | +$271.28 |
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
| 10 | 13 | 62% | +$77.46 | −$70.11 | −$40.00 | **−$32.65** | +$30.64 | 459 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 24 verified samples (need 30)
- **carry**: ⛔ not yet — cumulative closed P&L is -32.65 (need > 0)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
