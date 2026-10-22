# Paper-trading ledger — 2026-10-22 23:33 UTC

50 runs over 8.34 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 44 | 89% | +71.7 | +59.2 | +33.8 | +$260.35 |
| Cross-exchange (24 h) | 14 | 64% | +85.3 | +46.5 | -21.8 | +$65.12 |
| Cross-exchange (7 d) | 42 | 88% | +73.6 | +60.9 | +34.4 | +$255.91 |
| Triangular (all) | 16 | 100% | +34.0 | +34.1 | +22.4 | +$5.59 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 35 | 97% | +77.2 | +75.7 | +50.7 | +$265.03 |
| okx→bitget | 2 | 50% | +48.7 | -9.9 | -112.5 | −$1.99 |
| binance→okx | 1 | 100% | +165.6 | +168.9 | n/a | +$16.89 |
| binance→bybit | 1 | 100% | +39.0 | +35.8 | n/a | +$3.58 |
| bitget→bybit | 1 | 100% | +35.5 | +35.8 | n/a | +$3.58 |
| okx→bybit | 1 | 0% | +32.8 | -184.7 | n/a | −$18.46 |
| bybit→bitget | 1 | 0% | +32.3 | -62.9 | n/a | −$6.29 |
| okx→binance | 1 | 100% | +27.2 | +27.7 | n/a | +$2.77 |
| binance→bitget | 1 | 0% | +21.8 | -47.6 | n/a | −$4.76 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$5.97 | 98 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 16 verified samples (need 30)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
