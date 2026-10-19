# Paper-trading ledger — 2026-10-19 11:11 UTC

31 runs over 4.82 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 13 | 100% | +28.5 | +27.3 | +12.1 | +$35.50 |
| Cross-exchange (24 h) | 6 | 100% | +43.4 | +43.3 | +17.8 | +$26.00 |
| Cross-exchange (7 d) | 13 | 100% | +28.5 | +27.3 | +12.1 | +$35.50 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 12 | 100% | +25.9 | +26.1 | +9.8 | +$31.26 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$21.59 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 13 verified samples (need 30); ledger spans 4.82 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 4.82 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 4.82 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
