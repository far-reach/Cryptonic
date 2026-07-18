"""Paper executor: simulates taker fills and resting maker orders.

Taker legs fill at the opportunity's leg prices — those come from walking
live book depth, so they are realistic for small orders.

Maker (resting) orders are simulated against each cycle's fresh books: a
resting BUY at price p is considered filled when the market's best ask
drops to <= p (someone crossed our level). This is OPTIMISTIC — it ignores
queue position and time priority — so treat paper maker PnL as an upper
bound, and expect live fill rates to be lower.
"""

from __future__ import annotations

import logging
import uuid

from ..fees import FeeModel
from ..models import Fill, OpenOrder, Opportunity, OrderBook
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
            # book at the planned AVERAGE fill price from the depth walk, not
            # the worst-level limit price — otherwise multi-level fills would
            # overstate cost and corrupt paper PnL as a validation signal
            px = leg.fill_price
            fee = self.fees.taker_fee(shares, px, leg.category)
            fill = Fill(
                token_id=leg.token_id, side=leg.side, price=px,
                shares=shares, fee=fee, timestamp=now_iso(),
                strategy=opp.strategy, market_question=leg.market_question,
                outcome=leg.outcome, condition_id=leg.condition_id,
            )
            if leg.side == "BUY":
                self.portfolio.apply_buy(fill)
                total += px * shares + fee
            else:
                self.portfolio.apply_sell(fill)
        log.info("PAPER filled %s for $%.2f", opp.kind, total)
        return ExecutionResult(True, "paper fill", total)

    def place_maker(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        quote_key = opp.key
        legs = [(leg, round(leg.shares * scale, 2)) for leg in opp.legs]
        legs = [(l, s) for l, s in legs if s > 0]
        # affordability check for the WHOLE quote before placing any leg,
        # so a failure can never strand a one-legged quote
        need = sum(l.price * s for l, s in legs if l.side == "BUY")
        if need > self.portfolio.cash + 1e-9:
            return ExecutionResult(False, "quote exceeds free cash; skipped")
        placed = 0.0
        for leg, shares in legs:
            order = OpenOrder(
                order_id=f"paper-{uuid.uuid4().hex[:12]}",
                token_id=leg.token_id, side=leg.side, price=leg.price,
                shares=shares, strategy=opp.strategy,
                market_question=leg.market_question, outcome=leg.outcome,
                category=leg.category, condition_id=leg.condition_id,
                placed_at=now_iso(), quote_key=quote_key,
            )
            self.portfolio.add_open_order(order)
            placed += leg.price * shares
        log.info("PAPER quoted %s ($%.2f reserved)", opp.description[:70], placed)
        return ExecutionResult(True, "paper quote", placed)

    def cancel_order(self, order_id: str) -> bool:
        self.portfolio.cancel_open_order(order_id)
        return True

    def sync_orders(self, books: dict[str, OrderBook]) -> int:
        fills = 0
        for order in self.portfolio.open_orders():
            ob = books.get(order.token_id)
            if not ob:
                continue
            if order.side == "BUY" and ob.best_ask and ob.best_ask.price <= order.price + 1e-9:
                # maker fill: zero fee
                self.portfolio.fill_open_order(order.order_id, order.shares, fee=0.0)
                log.info("PAPER maker fill: BUY %.1f %s @ %.3f (%s)",
                         order.shares, order.outcome, order.price,
                         order.market_question[:50])
                fills += 1
            elif order.side == "SELL" and ob.best_bid and ob.best_bid.price >= order.price - 1e-9:
                self.portfolio.fill_open_order(order.order_id, order.shares, fee=0.0)
                fills += 1
        return fills
