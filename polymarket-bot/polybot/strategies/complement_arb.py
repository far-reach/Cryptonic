"""Complement arbitrage: buy YES + NO in the same binary market for < $1.

Whichever way the market resolves, one share of YES plus one share of NO
always pays exactly $1 total. If

    best_ask(YES) + best_ask(NO) + taker_fees  <  1 - min_edge

we can lock in a risk-free profit at resolution (or merge the pair back to
$1 of USDC early).

Reality check: Polymarket's CLOB matches complementary orders through
mint/merge, so a binary market's YES and NO books are normally exact mirrors
(NO ask == 1 - YES bid) and this can never be negative by more than fees.
The strategy exists to catch the rare de-syncs (operator hiccups, stale
books during volatility spikes) and costs nothing to check. The dependable
structural arb on Polymarket is the multi-outcome basket in negrisk_arb.py,
where sibling candidate markets have *independent* books.
"""

from __future__ import annotations

from ..models import Leg, Market, Opportunity, OrderBook
from .base import Strategy


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
        ask_y, ask_n = yes.best_ask.price, no.best_ask.price
        pair_price = ask_y + ask_n
        fee_per_pair = (self.fees.taker_fee(1, ask_y, m.category)
                        + self.fees.taker_fee(1, ask_n, m.category))
        edge = 1.0 - pair_price - fee_per_pair
        if edge < cfg.complement_min_edge:
            return None

        # size to the shallower best-ask level; budget cap applied later by risk mgr
        shares = min(yes.best_ask.size, no.best_ask.size)
        if shares <= 0:
            return None
        cost = shares * (pair_price + fee_per_pair)
        return Opportunity(
            strategy=self.name,
            kind="complement_arb",
            description=f"YES@{ask_y:.3f} + NO@{ask_n:.3f} < $1 | {m.question[:70]}",
            legs=[
                Leg(m.yes_token_id, "BUY", ask_y, shares, m.question, "Yes", m.category),
                Leg(m.no_token_id, "BUY", ask_n, shares, m.question, "No", m.category),
            ],
            edge=edge,
            expected_profit=shares * edge,
            total_cost=cost,
            guaranteed=True,
            end_date=m.end_date,
            key=f"comp:{m.condition_id}:{ask_y:.3f}:{ask_n:.3f}",
        )
