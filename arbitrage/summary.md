# Paper-trading ledger — 2026-10-22 00:37 UTC

45 runs over 7.38 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 31 | 100% | +68.2 | +68.0 | +47.5 | +$210.78 |
| Cross-exchange (24 h) | 7 | 100% | +133.4 | +133.7 | +95.4 | +$93.56 |
| Cross-exchange (7 d) | 31 | 100% | +68.2 | +68.0 | +47.5 | +$210.78 |
| Triangular (all) | 16 | 100% | +34.0 | +34.1 | +22.4 | +$5.59 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 30 | 100% | +68.5 | +68.8 | +47.7 | +$206.54 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$12.07 | 98 h |

## Go-live gate

- **cross-exchange**: ✅ passed
- **triangular**: ⛔ not yet — only 16 verified samples (need 30)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
