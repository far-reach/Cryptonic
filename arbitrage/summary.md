# Paper-trading ledger — 2026-10-24 16:54 UTC

60 runs over 10.06 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 54 | 85% | +66.6 | +51.1 | +27.5 | +$276.17 |
| Cross-exchange (24 h) | 10 | 70% | +44.3 | +15.8 | -43.2 | +$15.82 |
| Cross-exchange (7 d) | 49 | 84% | +71.3 | +54.6 | +28.8 | +$267.39 |
| Triangular (all) | 17 | 100% | +32.2 | +32.4 | +20.8 | +$5.60 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 39 | 95% | +78.0 | +76.2 | +52.3 | +$297.22 |
| okx→bitget | 4 | 50% | +35.3 | -37.4 | -123.1 | −$14.95 |
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
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$1.56 | 98 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 17 verified samples (need 30)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
