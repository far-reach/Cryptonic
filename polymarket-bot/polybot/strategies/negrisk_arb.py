"""Negative-risk (multi-outcome) arbitrage.

A negRisk event ("Who will win X?") lists one binary market per candidate and
guarantees that at most one YES resolves true. Two baskets can be mispriced:

1. YES basket — buy 1 YES of *every* candidate. Exactly one pays $1, so the
   basket is worth $1. Profitable when sum(YES asks) + fees < 1.
   REQUIRES an exhaustive outcome set: if the event is "augmented" (new
   candidates can still be added) an unlisted winner would zero the basket,
   so augmented events are skipped for this basket.

2. NO basket — buy 1 NO of every candidate. With n candidates and exactly one
   winner, n-1 NOs pay $1 -> basket worth $(n-1). Profitable when
   sum(NO asks) + fees < n - 1. This basket is SAFE even if the outcome set
   is not exhaustive: an unlisted winner makes *all* n NOs pay (worth $n,
   strictly better), so it never underperforms the assumption.

Both baskets size to the shallowest best-ask level across legs — one thin leg
caps the whole trade. More legs also mean more execution risk, so the edge
threshold is higher than for complement arb, and events with too many legs
are skipped.
"""

from __future__ import annotations

from ..models import Leg, Market, Opportunity, OrderBook
from .base import Strategy
from .depth import size_basket


def _event_markets(event: dict) -> list[Market]:
    out = []
    for raw in event.get("markets") or []:
        m = Market.from_gamma(raw)
        if m and m.active and not m.closed:
            # nested market entries lack the events[] backlink; carry the
            # parent event's metadata for labels and fee category
            m.event_slug = event.get("slug", "")
            m.event_title = event.get("title", "")
            m.category = m.category or (event.get("category") or "").lower()
            out.append(m)
    return out


class NegRiskArb(Strategy):
    name = "negrisk_arb"

    def find(self, markets, books, events):
        cfg = self.config.strategies
        if not cfg.negrisk_enabled:
            return []
        out: list[Opportunity] = []
        for event in events:
            listed = event.get("markets") or []
            ms = _event_markets(event)
            if not (2 <= len(ms) <= cfg.negrisk_max_legs):
                continue
            augmented = bool(event.get("negRiskAugmented", False))
            # YES basket needs the FULL outcome set: if any listed market was
            # dropped (paused/closed/unparseable), the survivors are not
            # exhaustive and the "guaranteed $1" payout is fiction.
            if not augmented and len(ms) == len(listed):
                opp = self._basket(event, ms, books, side="YES")
                if opp:
                    out.append(opp)
            opp = self._basket(event, ms, books, side="NO")
            if opp:
                out.append(opp)
        return out

    def _basket(self, event: dict, ms: list[Market],
                books: dict[str, OrderBook], side: str):
        cfg = self.config.strategies
        leg_books: list[OrderBook] = []
        for m in ms:
            token = m.yes_token_id if side == "YES" else m.no_token_id
            ob = books.get(token)
            if not ob or not ob.best_ask:
                return None
            leg_books.append(ob)

        payout = 1.0 if side == "YES" else float(len(ms) - 1)
        # per-leg categories can differ in theory; use the first market's
        # (an event's markets share a category in practice)
        category = ms[0].category
        sized = size_basket(
            leg_books, payout_per_share=payout,
            fee_fn=lambda p: self.fees.taker_fee(1, p, category),
            min_edge=cfg.negrisk_min_edge,
        )
        if not sized:
            return None
        shares, avg_prices, limit_prices, total_cost = sized
        basket_cost = sum(avg_prices)
        profit = shares * payout - total_cost

        legs = [
            Leg(m.yes_token_id if side == "YES" else m.no_token_id, "BUY",
                limit_prices[i], shares, m.question,
                "Yes" if side == "YES" else "No", m.category, m.condition_id,
                avg_price=avg_prices[i])
            for i, m in enumerate(ms)
        ]
        return Opportunity(
            strategy=self.name,
            kind=f"negrisk_{side.lower()}_arb",
            description=(f"{side} basket x{len(ms)} @ {basket_cost:.3f} "
                         f"(pays {payout:.0f}) | {event.get('title', '')[:60]}"),
            legs=legs,
            edge=profit / (shares * payout),
            expected_profit=profit,
            total_cost=total_cost,
            guaranteed=True,
            end_date=event.get("endDate", "") or "",
            key=f"negrisk:{side}:{event.get('slug', '')}:{basket_cost:.3f}",
        )
