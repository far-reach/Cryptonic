# Paper-trading ledger — 2026-10-18 19:24 UTC

27 runs over 4.16 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 9 | 100% | +16.1 | +14.4 | +5.2 | +$12.92 |
| Cross-exchange (24 h) | 4 | 100% | +10.4 | +10.3 | +0.2 | +$4.14 |
| Cross-exchange (7 d) | 9 | 100% | +16.1 | +14.4 | +5.2 | +$12.92 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 8 | 100% | +10.6 | +10.9 | +4.0 | +$8.68 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | – | +$0.00 | +$0.00 | −$0.00 | **+$0.00** | −$62.16 | 0 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 9 verified samples (need 30); ledger spans 4.16 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 4.16 days (need 7)
- **carry**: ⛔ not yet — only 0 closed paper positions (need 10); ledger spans 4.16 days (need 7); cumulative closed P&L is 0 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
