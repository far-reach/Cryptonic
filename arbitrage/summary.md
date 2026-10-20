# Paper-trading ledger — 2026-10-20 06:32 UTC

35 runs over 5.63 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 18 | 100% | +38.1 | +37.7 | +23.1 | +$67.81 |
| Cross-exchange (24 h) | 6 | 100% | +68.7 | +70.0 | +49.0 | +$42.00 |
| Cross-exchange (7 d) | 18 | 100% | +38.1 | +37.7 | +23.1 | +$67.81 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 17 | 100% | +36.8 | +37.4 | +21.9 | +$63.57 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$27.98 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 18 verified samples (need 30); ledger spans 5.63 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 5.63 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 5.63 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
