# Paper-trading ledger — 2026-11-08 18:28 UTC

127 runs over 25.12 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 111 | 91% | +70.9 | +63.8 | +48.6 | +$708.21 |
| Cross-exchange (24 h) | 9 | 100% | +91.1 | +91.0 | +38.3 | +$81.89 |
| Cross-exchange (7 d) | 26 | 100% | +77.5 | +78.3 | +46.2 | +$203.57 |
| Triangular (all) | 24 | 100% | +36.6 | +37.2 | +23.7 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 77 | 97% | +67.2 | +67.2 | +51.7 | +$517.53 |
| okx→bitget | 23 | 83% | +99.4 | +85.5 | +44.4 | +$196.78 |
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
| 10 | 6 | 33% | −$14.63 | −$53.58 | −$18.60 | **−$86.81** | +$59.08 | 268 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 24 verified samples (need 30)
- **carry**: ⛔ not yet — only 6 closed paper positions (need 10); cumulative closed P&L is -86.81 (need > 0); win rate 33% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
