# Paper-trading ledger — 2026-10-31 23:40 UTC

97 runs over 17.34 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 84 | 88% | +69.6 | +60.0 | +42.5 | +$503.94 |
| Cross-exchange (24 h) | 9 | 89% | +84.1 | +87.8 | +33.3 | +$78.98 |
| Cross-exchange (7 d) | 27 | 93% | +72.8 | +73.7 | +49.3 | +$199.10 |
| Triangular (all) | 22 | 100% | +38.9 | +39.6 | +25.3 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 63 | 97% | +80.4 | +80.2 | +62.7 | +$504.97 |
| okx→bitget | 10 | 60% | +37.2 | +5.1 | -45.5 | +$5.07 |
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
| 10 | 4 | 50% | +$6.28 | −$51.78 | −$12.40 | **−$57.90** | +$14.89 | 269 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 22 verified samples (need 30)
- **carry**: ⛔ not yet — only 4 closed paper positions (need 10); cumulative closed P&L is -57.9 (need > 0); win rate 50% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
