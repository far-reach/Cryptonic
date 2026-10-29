# Paper-trading ledger — 2026-10-29 21:45 UTC

87 runs over 15.26 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 67 | 87% | +63.5 | +51.0 | +31.2 | +$341.47 |
| Cross-exchange (24 h) | 3 | 67% | +27.3 | +19.6 | -25.5 | +$5.87 |
| Cross-exchange (7 d) | 23 | 83% | +48.0 | +35.3 | +4.8 | +$81.12 |
| Triangular (all) | 20 | 100% | +39.7 | +39.8 | +24.0 | +$5.69 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 50 | 96% | +70.5 | +69.4 | +49.9 | +$346.92 |
| okx→bitget | 6 | 50% | +53.2 | +1.1 | -85.3 | +$0.65 |
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
| 10 | 3 | 33% | −$1.15 | −$54.47 | −$9.40 | **−$65.02** | +$11.56 | 222 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 20 verified samples (need 30)
- **carry**: ⛔ not yet — only 3 closed paper positions (need 10); cumulative closed P&L is -65.02 (need > 0); win rate 33% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
