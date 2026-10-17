# Paper-trading ledger — 2026-10-17 23:58 UTC

22 runs over 3.35 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 6 | 100% | +17.8 | +15.2 | +2.4 | +$9.14 |
| Cross-exchange (24 h) | 4 | 100% | +11.1 | +11.8 | +1.4 | +$4.70 |
| Cross-exchange (7 d) | 6 | 100% | +17.8 | +15.2 | +2.4 | +$9.14 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 5 | 100% | +9.3 | +9.8 | +0.9 | +$4.90 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$34.05 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 6 verified samples (need 30); ledger spans 3.35 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 3.35 days (need 7)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 3.35 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
