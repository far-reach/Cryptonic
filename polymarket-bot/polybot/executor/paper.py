"""Paper executor: simulates fills at the opportunity's leg prices.

Leg prices come from live best-ask levels sized within their depth, so
assuming a fill at that price is realistic for small orders. Real execution
still carries risks paper trading cannot show: being front-run, books moving
between legs, and partial fills. Treat paper results as an upper bound.
"""

from __future__ import annotations

import logging

from ..fees import FeeModel
from ..models import Fill, Opportunity
from ..portfolio import Portfolio, now_iso
from .base import ExecutionResult, Executor

log = logging.getLogger(__name__)


class PaperExecutor(Executor):
    def __init__(self, portfolio: Portfolio, fees: FeeModel):
        self.portfolio = portfolio
        self.fees = fees

    def execute(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        total = 0.0
        for leg in opp.legs:
            shares = leg.shares * scale
            fee = self.fees.taker_fee(shares, leg.price, leg.category)
            fill = Fill(
                token_id=leg.token_id, side=leg.side, price=leg.price,
                shares=shares, fee=fee, timestamp=now_iso(),
                strategy=opp.strategy, market_question=leg.market_question,
                outcome=leg.outcome,
            )
            if leg.side == "BUY":
                self.portfolio.apply_buy(fill)
                total += leg.price * shares + fee
            else:
                self.portfolio.apply_sell(fill)
        log.info("PAPER filled %s for $%.2f", opp.kind, total)
        return ExecutionResult(True, "paper fill", total)
