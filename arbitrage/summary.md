# Paper-trading ledger — 2026-10-17 04:56 UTC

16 runs over 2.56 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 3 | 100% | +28.8 | +23.5 | +0.6 | +$7.06 |
| Cross-exchange (24 h) | 1 | 100% | +24.2 | +26.2 | n/a | +$2.62 |
| Cross-exchange (7 d) | 3 | 100% | +28.8 | +23.5 | +0.6 | +$7.06 |
| Triangular (all) | 0 | 0% | +0.0 | +0.0 | +0.0 | +$0.00 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 2 | 100% | +13.1 | +14.1 | -9.6 | +$2.82 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$50.07 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 3 verified samples (need 30); ledger spans 2.56 days (need 7)
- **triangular**: ⛔ not yet — only 0 verified samples (need 30); ledger spans 2.56 days (need 7); cumulative paper P&L is 0 (need > 0); win rate 0% (need 55%); 95% CI lower bound 0 bps (need > 0)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 2.56 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
