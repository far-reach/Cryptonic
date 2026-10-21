# Paper-trading ledger — 2026-10-21 13:11 UTC

42 runs over 6.9 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 28 | 100% | +58.9 | +58.7 | +39.0 | +$164.45 |
| Cross-exchange (24 h) | 9 | 100% | +96.3 | +96.6 | +51.8 | +$86.90 |
| Cross-exchange (7 d) | 28 | 100% | +58.9 | +58.7 | +39.0 | +$164.45 |
| Triangular (all) | 16 | 100% | +34.0 | +34.1 | +22.4 | +$5.59 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 27 | 100% | +58.9 | +59.3 | +38.9 | +$160.21 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$16.28 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 28 verified samples (need 30); ledger spans 6.9 days (need 7)
- **triangular**: ⛔ not yet — only 16 verified samples (need 30); ledger spans 6.9 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 6.9 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
