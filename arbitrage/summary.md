# Paper-trading ledger — 2026-11-20 22:38 UTC

169 runs over 37.3 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 149 | 90% | +65.2 | +57.7 | +44.8 | +$860.31 |
| Cross-exchange (24 h) | 13 | 77% | +42.0 | +19.1 | -22.8 | +$24.77 |
| Cross-exchange (7 d) | 23 | 87% | +44.1 | +31.3 | +3.0 | +$72.07 |
| Triangular (all) | 34 | 100% | +82.7 | +83.1 | +57.1 | +$7.23 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 91 | 97% | +61.9 | +61.8 | +47.8 | +$562.50 |
| okx→bitget | 38 | 87% | +87.0 | +78.4 | +49.4 | +$297.85 |
| binance→bybit | 4 | 75% | +41.3 | +34.4 | -6.9 | +$13.73 |
| binance→okx | 3 | 33% | +61.3 | +24.8 | -123.8 | +$7.44 |
| bitget→bybit | 3 | 100% | +52.7 | +49.9 | +9.0 | +$14.96 |
| bybit→bitget | 3 | 33% | +33.0 | -76.8 | -226.3 | −$23.06 |
| okx→bybit | 2 | 50% | +24.9 | -88.0 | -277.4 | −$17.61 |
| binance→bitget | 2 | 50% | +18.5 | -14.8 | -79.2 | −$2.95 |
| okx→binance | 1 | 100% | +27.2 | +27.7 | n/a | +$2.77 |
| bybit→okx | 1 | 100% | +6.2 | +5.8 | n/a | +$0.58 |
| bitget→binance | 1 | 100% | +44.2 | +41.0 | n/a | +$4.10 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 13 | 62% | +$77.46 | −$70.11 | −$40.00 | **−$32.65** | +$40.61 | 459 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ✅ passed
- **carry**: ⛔ not yet — cumulative closed P&L is -32.65 (need > 0)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
