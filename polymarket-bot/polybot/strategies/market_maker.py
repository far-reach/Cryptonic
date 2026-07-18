"""Passive market making: earn the spread as a maker (zero fees + rebates).

Why this is the dependable earner for a small account: since March 2026
Polymarket charges takers up to ~1.8% per trade and charges makers NOTHING —
and redistributes 100% of taker fees to makers as daily rebates. A resting
order therefore starts every trade with the whole fee curve as tailwind.

The quote structure ("pair capture"): in one binary market, rest a BUY on
YES at price b_y and a BUY on NO at price b_n with

    b_y + b_n <= 1 - maker_min_capture.

If BOTH fill we own a YES+NO pair: worth exactly $1 at resolution (mergeable
to USDC), bought for < $1 — locked profit with no directional view. Because
Polymarket's book is mirrored (a NO bid is a YES ask), this is equivalent to
quoting both sides of the YES book around fair value; posting it as two BUYs
means we never need inventory to quote.

The risk is single-sided fills (adverse selection): news moves the price,
one side fills, the other never does, and we hold directional inventory.
Managed by:
  - only quoting mid-range prices (maker_mid_low..maker_mid_high) in high-
    volume markets ending > maker_min_days_to_end away — no tails, no
    resolution-eve gamma
  - an unpaired-inventory cap per market, and a stop that dumps inventory
    at market if the mid runs maker_inventory_stop away from our cost
  - cancel/replace when the mid drifts maker_requote_ticks, so quotes never
    go stale

This strategy only *emits* desired quotes (execution="maker"); order
placement, requoting and inventory handling live in the bot loop and
executors, which track resting orders in the portfolio.
"""

from __future__ import annotations

from ..models import Leg, Market, Opportunity, OrderBook
from .base import Strategy
from .value import days_until


def clamp_to_tick(price: float, tick: float) -> float:
    """Round DOWN to the market's tick grid, keeping inside (tick, 1-tick)."""
    steps = int(price / tick + 1e-9)
    p = steps * tick
    return max(tick, min(round(p, 6), 1.0 - tick))


class MarketMaker(Strategy):
    name = "market_maker"

    def find(self, markets, books, events):
        cfg = self.config.strategies
        if not cfg.maker_enabled:
            return []
        candidates: list[tuple[float, Opportunity]] = []
        for m in markets:
            opp = self.evaluate(m, books.get(m.yes_token_id))
            if opp:
                # prefer the busiest markets: more flow = faster two-sided fills
                candidates.append((m.volume_24h, opp))
        candidates.sort(key=lambda c: c[0], reverse=True)
        return [opp for _, opp in candidates[:cfg.maker_max_markets]]

    def evaluate(self, m: Market, yes: OrderBook | None):
        cfg = self.config.strategies
        if not yes or not yes.best_bid or not yes.best_ask:
            return None
        if m.volume_24h < cfg.maker_min_volume_24h:
            return None
        days = days_until(m.end_date)
        if days is None or days < cfg.maker_min_days_to_end:
            return None
        mid = yes.midpoint
        spread = yes.spread or 0.0
        if mid is None or not (cfg.maker_mid_low <= mid <= cfg.maker_mid_high):
            return None
        if spread < cfg.maker_min_spread:
            return None

        tick = m.tick_size or 0.01
        # join the touch on both complements: YES bid at best bid, NO bid at
        # the mirror of the best ask (1 - ask). Pair cost = 1 - spread.
        b_y = clamp_to_tick(yes.best_bid.price, tick)
        b_n = clamp_to_tick(1.0 - yes.best_ask.price, tick)
        capture = 1.0 - (b_y + b_n)
        if capture < cfg.maker_min_capture:
            return None

        pair_cost = b_y + b_n
        shares = max(1.0, round(cfg.maker_quote_usdc / pair_cost, 2))
        return Opportunity(
            strategy=self.name,
            kind="maker_quote",
            description=(f"quote YES@{b_y:.2f} / NO@{b_n:.2f} "
                         f"(capture {capture:.2f}/pair) | {m.question[:60]}"),
            legs=[
                Leg(m.yes_token_id, "BUY", b_y, shares, m.question, "Yes",
                    m.category, m.condition_id),
                Leg(m.no_token_id, "BUY", b_n, shares, m.question, "No",
                    m.category, m.condition_id),
            ],
            edge=capture / pair_cost,
            expected_profit=shares * capture,   # if both sides fill
            total_cost=shares * pair_cost,
            guaranteed=False,                    # fills are not guaranteed
            confidence=0.5,
            end_date=m.end_date,
            key=f"maker:{m.condition_id}",       # one live quote per market
            execution="maker",
            tick=tick,
        )
