# Paper-trading ledger — 2026-10-17 19:16 UTC

20 runs over 3.16 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 5 | 100% | +20.6 | +17.6 | +2.8 | +$8.78 |
| Cross-exchange (24 h) | 3 | 100% | +13.6 | +14.5 | +1.9 | +$4.34 |
| Cross-exchange (7 d) | 5 | 100% | +20.6 | +17.6 | +2.8 | +$8.78 |
| Triangular (all) | 0 | 0% | +0.0 | +0.0 | +0.0 | +$0.00 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 4 | 100% | +10.7 | +11.4 | +0.6 | +$4.54 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$41.54 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 5 verified samples (need 30); ledger spans 3.16 days (need 7)
- **triangular**: ⛔ not yet — only 0 verified samples (need 30); ledger spans 3.16 days (need 7); cumulative paper P&L is 0 (need > 0); win rate 0% (need 55%); 95% CI lower bound 0 bps (need > 0)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 3.16 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
