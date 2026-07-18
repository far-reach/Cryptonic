"""Settlement: detect resolved markets and credit held positions.

Gamma reports resolution on the market object: `closed: true` together with
`outcomePrices` collapsing to ["1","0"] or ["0","1"]. Redeeming a winning
share pays exactly $1 with no fee (on-chain redemption; the live bot's
shares auto-redeem via Polymarket's UI/relayer — verify your balance there).

Only settles when the outcome prices are unambiguous 0/1; anything else
(disputed, still trading, 50/50 refund) is left alone and logged.
"""

from __future__ import annotations

import logging

from .api import GammaClient
from .portfolio import Portfolio

log = logging.getLogger(__name__)


def _resolved_outcome(market_raw: dict) -> int | None:
    """Index of the winning outcome (0=YES, 1=NO), or None if not resolved."""
    if not market_raw.get("closed"):
        return None
    import json
    prices = market_raw.get("outcomePrices") or "[]"
    if isinstance(prices, str):
        try:
            prices = json.loads(prices)
        except json.JSONDecodeError:
            return None
    try:
        vals = [float(x) for x in prices]
    except (TypeError, ValueError):
        return None
    if len(vals) != 2:
        return None
    if vals[0] >= 0.999 and vals[1] <= 0.001:
        return 0
    if vals[1] >= 0.999 and vals[0] <= 0.001:
        return 1
    return None  # unresolved / disputed / split — do not touch


class SettlementChecker:
    def __init__(self, gamma: GammaClient | None, portfolio: Portfolio):
        self.gamma = gamma
        self.portfolio = portfolio

    def run(self) -> float:
        """Settle any held positions whose market has resolved.

        Returns total realized PnL from settlements this pass.
        """
        if self.gamma is None:
            return 0.0
        positions = self.portfolio.positions()
        condition_ids = sorted({p.condition_id for p in positions if p.condition_id})
        if not condition_ids:
            return 0.0
        try:
            markets = self.gamma.markets_by_condition(condition_ids)
        except ConnectionError as e:
            log.warning("settlement check skipped (network): %s", e)
            return 0.0

        total_pnl = 0.0
        for raw in markets:
            winner = _resolved_outcome(raw)
            if winner is None:
                continue
            cid = raw.get("conditionId", "")
            import json
            token_ids = raw.get("clobTokenIds") or "[]"
            if isinstance(token_ids, str):
                try:
                    token_ids = json.loads(token_ids)
                except json.JSONDecodeError:
                    continue
            if len(token_ids) != 2:
                continue
            win_token = str(token_ids[winner])
            for p in positions:
                if p.condition_id != cid:
                    continue
                won = p.token_id == win_token
                pnl = self.portfolio.settle_position(p.token_id, won)
                total_pnl += pnl
                log.info("SETTLED %s '%s' -> %s (pnl %+.2f)",
                         p.outcome, p.market_question[:50],
                         "WON" if won else "LOST", pnl)
        return total_pnl
