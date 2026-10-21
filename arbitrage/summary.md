# Paper-trading ledger — 2026-10-21 07:29 UTC

41 runs over 6.67 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 26 | 100% | +56.8 | +56.5 | +36.8 | +$146.80 |
| Cross-exchange (24 h) | 8 | 100% | +98.9 | +98.8 | +55.2 | +$78.99 |
| Cross-exchange (7 d) | 26 | 100% | +56.8 | +56.5 | +36.8 | +$146.80 |
| Triangular (all) | 10 | 100% | +37.6 | +37.4 | +19.0 | +$4.55 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 25 | 100% | +56.6 | +57.0 | +36.6 | +$142.56 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$13.97 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 26 verified samples (need 30); ledger spans 6.67 days (need 7)
- **triangular**: ⛔ not yet — only 10 verified samples (need 30); ledger spans 6.67 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 6.67 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
