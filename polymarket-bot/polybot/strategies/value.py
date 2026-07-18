"""Near-resolution favorite strategy (probabilistic, NOT arbitrage).

Prediction markets show a persistent favorite-longshot bias: heavy favorites
(price >= ~0.90) historically resolve YES slightly *more* often than their
price implies, because longshot buyers and early profit-takers keep a small
discount in the favorite's price. Buying favorites close to resolution
harvests that discount plus the time-value convergence to $1.

This is a statistical edge, not a lock. Controls:
  - only prices in [value_min_price, value_max_price]
  - only markets ending within value_max_days_to_end
  - liquidity/volume floors so we can exit if needed
  - required annualized return AFTER fees
  - fractional-Kelly sizing with a capped per-market allocation

Losing trades lose ~the full stake (favorite fails -> share -> $0), which is
why sizing and diversification (max_value_positions) matter more than entry.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..models import Leg, Market, Opportunity, OrderBook
from .base import Strategy

# Extra probability we credit a heavy favorite over its midpoint, per the
# favorite-longshot bias. Deliberately small; set to 0 to trade purely on
# time-value convergence.
FAVORITE_BIAS = 0.01


def days_until(iso_date: str) -> float | None:
    if not iso_date:
        return None
    try:
        end = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (end - datetime.now(timezone.utc)).total_seconds() / 86_400.0


class ValueFavorites(Strategy):
    name = "value_favorites"

    def find(self, markets, books, events):
        cfg = self.config.strategies
        if not cfg.value_enabled:
            return []
        out: list[Opportunity] = []
        for m in markets:
            if m.volume_24h < cfg.value_min_volume_24h:
                continue
            if m.liquidity < cfg.value_min_liquidity:
                continue
            days = days_until(m.end_date)
            if days is None or not (0.02 < days <= cfg.value_max_days_to_end):
                continue
            # the favorite may be YES or NO — check both tokens
            for token_id, outcome in ((m.yes_token_id, "Yes"), (m.no_token_id, "No")):
                ob = books.get(token_id)
                if not ob or not ob.best_ask or not ob.best_bid:
                    continue
                opp = self.evaluate(m, ob, token_id, outcome, days)
                if opp:
                    out.append(opp)
        return out

    def evaluate(self, m: Market, ob: OrderBook, token_id: str,
                 outcome: str, days: float):
        cfg = self.config.strategies
        ask = ob.best_ask.price
        if not (cfg.value_min_price <= ask <= cfg.value_max_price):
            return None
        mid = ob.midpoint
        if mid is None or (ob.spread or 1.0) > 0.03:
            return None

        fee_per_share = self.fees.taker_fee(1, ask, m.category)
        p_est = min(0.995, mid + FAVORITE_BIAS)
        cost = ask + fee_per_share
        ev_per_share = p_est - cost          # expected profit per share
        if ev_per_share <= 0:
            return None
        ret = (1.0 - cost) / cost            # return if it resolves our way
        annualized = ret * (365.0 / max(days, 0.25))
        if annualized < cfg.value_min_annualized_return:
            return None

        # Kelly for a binary payoff: b = net odds, f* = p - (1-p)/b
        b = (1.0 - cost) / cost
        kelly = max(0.0, p_est - (1.0 - p_est) / b)
        frac = kelly * self.config.risk.kelly_fraction
        stake = min(frac * self.config.risk.bankroll_usdc,
                    self.config.risk.max_trade_usdc)
        if stake < 1.0:
            return None
        shares = min(stake / cost, ob.best_ask.size)
        if shares * cost < 1.0:
            return None

        return Opportunity(
            strategy=self.name,
            kind="value",
            description=(f"{outcome}@{ask:.3f}, {days:.1f}d left, "
                         f"{annualized:.0%} ann. | {m.question[:60]}"),
            legs=[Leg(token_id, "BUY", ask, shares, m.question, outcome, m.category, m.condition_id)],
            edge=ev_per_share,
            expected_profit=shares * ev_per_share,
            total_cost=shares * cost,
            guaranteed=False,
            confidence=p_est,
            end_date=m.end_date,
            key=f"value:{m.condition_id}:{outcome}",
        )
