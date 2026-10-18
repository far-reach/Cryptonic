# Paper-trading ledger — 2026-10-18 16:50 UTC

26 runs over 4.06 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 8 | 100% | +14.9 | +13.0 | +3.1 | +$10.37 |
| Cross-exchange (24 h) | 3 | 100% | +5.3 | +5.3 | +2.0 | +$1.59 |
| Cross-exchange (7 d) | 8 | 100% | +14.9 | +13.0 | +3.1 | +$10.37 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 7 | 100% | +8.4 | +8.8 | +2.4 | +$6.13 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$40.79 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 8 verified samples (need 30); ledger spans 4.06 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 4.06 days (need 7)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 4.06 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
