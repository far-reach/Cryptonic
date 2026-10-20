# Paper-trading ledger — 2026-10-20 01:13 UTC

34 runs over 5.41 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 17 | 100% | +35.9 | +34.5 | +20.5 | +$58.58 |
| Cross-exchange (24 h) | 6 | 100% | +66.8 | +65.2 | +46.1 | +$39.11 |
| Cross-exchange (7 d) | 17 | 100% | +35.9 | +34.5 | +20.5 | +$58.58 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 16 | 100% | +34.4 | +34.0 | +19.1 | +$54.34 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$16.44 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 17 verified samples (need 30); ledger spans 5.41 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 5.41 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 5.41 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
