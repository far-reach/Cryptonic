# Paper-trading ledger — 2026-10-18 13:11 UTC

25 runs over 3.9 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 7 | 100% | +15.7 | +13.6 | +2.2 | +$9.50 |
| Cross-exchange (24 h) | 2 | 100% | +3.7 | +3.6 | +3.6 | +$0.72 |
| Cross-exchange (7 d) | 7 | 100% | +15.7 | +13.6 | +2.2 | +$9.50 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 6 | 100% | +8.3 | +8.8 | +1.3 | +$5.26 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$36.83 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 7 verified samples (need 30); ledger spans 3.9 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 3.9 days (need 7)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 3.9 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
