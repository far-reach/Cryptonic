# Paper-trading ledger — 2026-11-20 07:00 UTC

167 runs over 36.65 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 138 | 91% | +67.0 | +61.3 | +48.0 | +$845.32 |
| Cross-exchange (24 h) | 5 | 100% | +37.5 | +37.1 | +22.2 | +$18.58 |
| Cross-exchange (7 d) | 15 | 100% | +38.1 | +38.8 | +13.7 | +$58.14 |
| Triangular (all) | 30 | 100% | +67.4 | +67.9 | +43.1 | +$6.61 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 91 | 97% | +61.9 | +61.8 | +47.8 | +$562.50 |
| okx→bitget | 36 | 86% | +89.2 | +80.3 | +49.8 | +$288.92 |
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
| 10 | 13 | 62% | +$77.46 | −$70.11 | −$40.00 | **−$32.65** | +$42.23 | 459 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ✅ passed
- **carry**: ⛔ not yet — cumulative closed P&L is -32.65 (need > 0)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
