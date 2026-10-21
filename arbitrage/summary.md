# Paper-trading ledger — 2026-10-21 18:15 UTC

43 runs over 7.11 days (since 2026-10-14). Every detected opportunity is re-priced a few seconds later at real quotes; "realised" is what a full-size taker fill would have made then, net of fees.

## Verified opportunities

| Strategy | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-exchange (all) | 29 | 100% | +62.2 | +62.0 | +41.9 | +$179.88 |
| Cross-exchange (24 h) | 8 | 100% | +113.3 | +113.6 | +68.6 | +$90.84 |
| Cross-exchange (7 d) | 29 | 100% | +62.2 | +62.0 | +41.9 | +$179.88 |
| Triangular (all) | 16 | 100% | +34.0 | +34.1 | +22.4 | +$5.59 |

### By venue pair

| Pair | Samples | Survived | Expected bps | Realised bps | 95% CI low | Paper P&L |
| --- | --- | --- | --- | --- | --- | --- |
| bitget→okx | 28 | 100% | +62.3 | +62.7 | +41.9 | +$175.64 |
| okx→bitget | 1 | 100% | +60.1 | +42.4 | n/a | +$4.24 |

## Carry positions (long spot / short perp, paper)

| Open | Closed | Wins | Funding | Leg P&L | Fees | Closed P&L | Open P&L | Mean hold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 0% | −$7.04 | −$49.46 | −$3.20 | **−$59.70** | −$12.13 | 98 h |

## Go-live gate

- **cross-exchange**: ⛔ not yet — only 29 verified samples (need 30)
- **triangular**: ⛔ not yet — only 16 verified samples (need 30)
- **carry**: ⛔ not yet — only 1 closed paper positions (need 10); cumulative closed P&L is -59.7 (need > 0); win rate 0% (need 55%)

> Paper fills assume taker orders at the re-priced book with no queue position and no exchange latency beyond the verification delay. Real fills are worse, never better. The gate is a necessary condition for live trading, not a sufficient one.
