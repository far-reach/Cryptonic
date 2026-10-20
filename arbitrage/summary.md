# Paper-trading ledger — 2026-10-20 16:53 UTC

37 runs over 6.06 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 21 | 100% | +42.8 | +42.4 | +26.7 | +$89.04 |
| Cross-exchange (24 h) | 8 | 100% | +66.0 | +66.9 | +40.9 | +$53.54 |
| Cross-exchange (7 d) | 21 | 100% | +42.8 | +42.4 | +26.7 | +$89.04 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 20 | 100% | +41.9 | +42.4 | +25.9 | +$84.80 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$22.14 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 21 verified samples (need 30); ledger spans 6.06 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 6.06 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 6.06 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
