# Paper-trading ledger — 2026-11-11 00:35 UTC

135 runs over 27.38 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 119 | 91% | +72.7 | +66.0 | +51.1 | +$785.37 |
| Cross-exchange (24 h) | 1 | 100% | +4.8 | +4.7 | n/a | +$0.47 |
| Cross-exchange (7 d) | 30 | 97% | +73.9 | +74.0 | +45.1 | +$222.03 |
| Triangular (all) | 24 | 100% | +36.6 | +37.2 | +23.7 | +$5.71 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 80 | 98% | +65.1 | +65.2 | +50.0 | +$521.40 |
| okx→bitget | 28 | 82% | +108.3 | +96.5 | +59.5 | +$270.07 |
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
| 10 | 6 | 33% | −$14.63 | −$53.58 | −$18.60 | **−$86.81** | +$85.16 | 268 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 24 verified samples (need 30)
- **carry**: ⛔ not yet — only 6 closed paper positions (need 10); cumulative closed P&L is -86.81 (need > 0); win rate 33% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
