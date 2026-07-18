"""Depth-aware sizing for multi-leg arbitrage.

Taking only the best-ask level leaves money on the table when deeper levels
still clear the edge threshold. This walks all legs' books together and
finds the largest size whose MARGINAL unit (the next share across all legs)
still earns at least `min_edge` per $1 of payout — edge decays level by
level, so the marginal check is the correct stopping rule.
"""

from __future__ import annotations

from typing import Callable

from ..models import OrderBook

MAX_LEVELS = 5


def size_basket(books: list[OrderBook], payout_per_share: float,
                fee_fn: Callable[[float], float], min_edge: float,
                ) -> tuple[float, list[float], list[float], float] | None:
    """Best executable size for buying 1 share of every book in `books`.

    fee_fn(price) -> taker fee for one share at that price.
    Returns (shares, avg_prices, limit_prices, total_cost_with_fees) or None
    if even the first unit doesn't clear min_edge. limit_prices are the
    deepest level prices used per leg — the worst price each FOK leg may pay.
    """
    ladders = [b.ask_breakpoints(MAX_LEVELS) for b in books]
    if any(not lad for lad in ladders):
        return None

    # candidate sizes: every level boundary of every leg, ascending
    candidates = sorted({round(cum, 6) for lad in ladders for cum, _, _ in lad})

    def leg_state(lad, size):
        """(cum_cost, marginal_price) at `size`, or None if not enough depth."""
        prev_shares = 0.0
        prev_cost = 0.0
        for cum_shares, cum_cost, price in lad:
            if size <= cum_shares + 1e-9:
                return prev_cost + (size - prev_shares) * price, price
            prev_shares, prev_cost = cum_shares, cum_cost
        return None

    best = None
    for size in candidates:
        states = [leg_state(lad, size) for lad in ladders]
        if any(s is None for s in states):
            break
        marginal_prices = [s[1] for s in states]
        marginal_cost = sum(marginal_prices) + sum(fee_fn(p) for p in marginal_prices)
        marginal_edge = (payout_per_share - marginal_cost) / payout_per_share
        if marginal_edge < min_edge:
            break
        costs = [s[0] for s in states]
        avg_prices = [c / size for c in costs]
        total_fees = sum(fee_fn(p) * size for p in avg_prices)
        best = (size, avg_prices, marginal_prices, sum(costs) + total_fees)
    return best
