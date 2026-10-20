# Paper-trading ledger — 2026-10-20 23:21 UTC

39 runs over 6.33 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 24 | 100% | +49.2 | +48.8 | +30.8 | +$117.22 |
| Cross-exchange (24 h) | 8 | 100% | +80.3 | +82.5 | +44.5 | +$65.98 |
| Cross-exchange (7 d) | 24 | 100% | +49.2 | +48.8 | +30.8 | +$117.22 |
| Triangular (all) | 4 | 100% | +71.0 | +71.0 | +70.3 | +$3.40 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 23 | 100% | +48.7 | +49.1 | +30.3 | +$112.98 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$17.29 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 24 verified samples (need 30); ledger spans 6.33 days (need 7)
- **triangular**: ⛔ not yet — only 4 verified samples (need 30); ledger spans 6.33 days (need 7)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); ledger spans 6.33 days (need 7); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
