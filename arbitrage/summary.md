# Paper-trading ledger — 2026-10-19 00:09 UTC

29 runs over 4.36 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 11 | 100% | +19.1 | +17.7 | +8.9 | +$19.47 |
| Cross-exchange (24 h) | 5 | 100% | +20.7 | +20.6 | +8.1 | +$10.33 |
| Cross-exchange (7 d) | 11 | 100% | +19.1 | +17.7 | +8.9 | +$19.47 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 10 | 100% | +15.0 | +15.2 | +7.2 | +$15.23 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$21.51 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 11 verified samples (need 30); ledger spans 4.36 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 4.36 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 4.36 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
