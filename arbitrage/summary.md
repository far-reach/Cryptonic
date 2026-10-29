# Paper-trading ledger — 2026-10-29 02:47 UTC

84 runs over 14.47 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 64 | 88% | +65.2 | +52.4 | +31.9 | +$335.60 |
| Cross-exchange (24 h) | 0 | 0% | +0.0 | +0.0 | +0.0 | +$0.00 |
| Cross-exchange (7 d) | 33 | 76% | +62.5 | +37.8 | +3.3 | +$124.82 |
| Triangular (all) | 18 | 100% | +30.9 | +31.0 | +19.8 | +$5.61 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 48 | 96% | +71.9 | +70.7 | +50.5 | +$339.49 |
| okx→bitget | 5 | 60% | +62.3 | +4.4 | -101.0 | +$2.21 |
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
| 10 | 2 | 0% | −$8.16 | −$52.12 | −$6.20 | **−$66.48** | +$10.00 | 158 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 18 verified samples (need 30)
- **carry**: ⛔ not yet — only 2 closed paper positions (need 10); cumulative closed P&L is -66.48 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
