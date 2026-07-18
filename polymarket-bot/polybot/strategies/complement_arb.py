"""Complement arbitrage: buy YES + NO in the same binary market for < $1.

Whichever way the market resolves, one share of YES plus one share of NO
always pays exactly $1 total. If

    ask(YES) + ask(NO) + taker_fees  <  1 - min_edge

we can lock in a risk-free profit at resolution (or merge the pair back to
$1 of USDC early).

Reality check: Polymarket's CLOB matches complementary orders through
mint/merge, so a binary market's YES and NO books are normally exact mirrors
(NO ask == 1 - YES bid) and this can never be negative by more than fees.
The strategy exists to catch the rare de-syncs (operator hiccups, stale
books during volatility spikes) and costs nothing to check. The dependable
structural arb on Polymarket is the multi-outcome basket in negrisk_arb.py,
where sibling candidate markets have *independent* books.

Sizing walks BOTH books level by level (see depth.py) and stops where the
marginal pair no longer clears the edge threshold.
"""

from __future__ import annotations

from ..models import Leg, Market, Opportunity, OrderBook
from .base import Strategy
from .depth import size_basket


class ComplementArb(Strategy):
    name = "complement_arb"

    def find(self, markets, books, events):
        cfg = self.config.strategies
        if not cfg.complement_enabled:
            return []
        out: list[Opportunity] = []
        for m in markets:
            yes = books.get(m.yes_token_id)
            no = books.get(m.no_token_id)
            if not yes or not no or not yes.best_ask or not no.best_ask:
                continue
            opp = self.evaluate(m, yes, no)
            if opp:
                out.append(opp)
        return out

    def evaluate(self, m: Market, yes: OrderBook, no: OrderBook):
        cfg = self.config.strategies
        sized = size_basket(
            [yes, no], payout_per_share=1.0,
            fee_fn=lambda p: self.fees.taker_fee(1, p, m.category),
            min_edge=cfg.complement_min_edge,
        )
        if not sized:
            return None
        shares, avg_prices, limit_prices, total_cost = sized
        profit = shares * 1.0 - total_cost
        edge = profit / shares
        return Opportunity(
            strategy=self.name,
            kind="complement_arb",
            description=(f"YES@{avg_prices[0]:.3f} + NO@{avg_prices[1]:.3f} < $1 "
                         f"| {m.question[:70]}"),
            legs=[
                Leg(m.yes_token_id, "BUY", limit_prices[0], shares, m.question,
                    "Yes", m.category, m.condition_id, avg_price=avg_prices[0]),
                Leg(m.no_token_id, "BUY", limit_prices[1], shares, m.question,
                    "No", m.category, m.condition_id, avg_price=avg_prices[1]),
            ],
            edge=edge,
            expected_profit=profit,
            total_cost=total_cost,
            guaranteed=True,
            end_date=m.end_date,
            key=(f"comp:{m.condition_id}:"
                 f"{yes.best_ask.price:.3f}:{no.best_ask.price:.3f}"),
        )
