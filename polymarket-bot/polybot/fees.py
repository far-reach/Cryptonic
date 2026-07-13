"""Polymarket taker-fee model (March 2026 schedule).

Since 2026-03-23 Polymarket charges *takers* a per-trade fee:

    fee_usdc = shares * base_rate * p * (1 - p)

where p is the execution price. The fee peaks at p = 0.50 and falls toward
the extremes; makers pay nothing (and earn rebates). Base rates differ by
market category. The rates below reproduce the published "max fee per 100
shares" table (max is at p=0.5, i.e. base_rate/4 dollars per share):

    politics/finance/tech/mentions : $1.00 / 100 sh  -> base_rate 0.04
    sports/econ/culture/weather/.. : $1.25 / 100 sh  -> base_rate 0.05
    crypto                         : $1.75 / 100 sh  -> base_rate 0.07
    geopolitics                    : free            -> base_rate 0.00

Rates may drift — override per category in config.yaml. When a market's
category is unknown we assume DEFAULT_RATE (worst common case) so edge
estimates stay conservative.
"""

from __future__ import annotations

DEFAULT_RATE = 0.05

CATEGORY_RATES: dict[str, float] = {
    "politics": 0.04,
    "finance": 0.04,
    "tech": 0.04,
    "mentions": 0.04,
    "sports": 0.05,
    "economics": 0.05,
    "economy": 0.05,
    "culture": 0.05,
    "pop-culture": 0.05,
    "weather": 0.05,
    "crypto": 0.07,
    "geopolitics": 0.0,
    "world": 0.0,
}


class FeeModel:
    def __init__(self, overrides: dict[str, float] | None = None,
                 default_rate: float = DEFAULT_RATE):
        self.rates = dict(CATEGORY_RATES)
        if overrides:
            self.rates.update({k.lower(): float(v) for k, v in overrides.items()})
        self.default_rate = default_rate

    def base_rate(self, category: str) -> float:
        return self.rates.get((category or "").lower(), self.default_rate)

    def taker_fee(self, shares: float, price: float, category: str = "") -> float:
        """Fee in USDC for a taker fill of `shares` at `price`."""
        p = min(max(price, 0.0), 1.0)
        return shares * self.base_rate(category) * p * (1.0 - p)

    def taker_fee_rate_on_notional(self, price: float, category: str = "") -> float:
        """Fee as a fraction of the USDC notional (price * shares) of a buy."""
        p = min(max(price, 1e-9), 1.0)
        return self.base_rate(category) * (1.0 - p)
