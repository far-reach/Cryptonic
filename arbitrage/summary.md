# Paper-trading ledger — 2026-10-15 21:18 UTC

8 runs over 1.24 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 2 | 100% | +31.1 | +22.2 | -17.3 | +$4.44 |
| Cross-exchange (24 h) | 2 | 100% | +31.1 | +22.2 | -17.3 | +$4.44 |
| Cross-exchange (7 d) | 2 | 100% | +31.1 | +22.2 | -17.3 | +$4.44 |
| Triangular (all) | 0 | 0% | +0.0 | +0.0 | +0.0 | +$0.00 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 1 | 100% | +2.0 | +2.0 | n/a | +$0.20 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$56.33 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 2 verified samples (need 30); ledger spans 1.24 days (need 7); 95% CI lower bound -17.32 bps (need > 0)
- **triangular**: ⛔ not yet — only 0 verified samples (need 30); ledger spans 1.24 days (need 7); cumulative paper P&L is 0 (need > 0); win rate 0% (need 55%); 95% CI lower bound 0 bps (need > 0)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 1.24 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
