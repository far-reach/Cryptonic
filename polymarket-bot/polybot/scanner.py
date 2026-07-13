"""Scanner: pull market data, run every strategy, rank opportunities."""

from __future__ import annotations

import logging

from .api import ClobClient, GammaClient
from .config import Config
from .fees import FeeModel
from .models import Market, Opportunity, OrderBook
from .strategies.base import Strategy
from .strategies.complement_arb import ComplementArb
from .strategies.negrisk_arb import NegRiskArb
from .strategies.value import ValueFavorites, days_until

log = logging.getLogger(__name__)


class Scanner:
    def __init__(self, config: Config,
                 gamma: GammaClient | None = None,
                 clob: ClobClient | None = None):
        self.config = config
        self.gamma = gamma or GammaClient()
        self.clob = clob or ClobClient()
        self.fees = FeeModel(config.fee_overrides)
        self.strategies: list[Strategy] = [
            ComplementArb(config, self.fees),
            NegRiskArb(config, self.fees),
            ValueFavorites(config, self.fees),
        ]

    def _candidate_tokens(self, markets: list[Market], events: list[dict]) -> list[str]:
        """Pick which order books to fetch this cycle (bounded by book_top_n)."""
        scfg, stcfg = self.config.scanner, self.config.strategies
        tokens: list[str] = []
        seen: set[str] = set()

        def add(m: Market):
            for t in (m.yes_token_id, m.no_token_id):
                if t and t not in seen:
                    seen.add(t)
                    tokens.append(t)

        # negRisk event legs first — those opportunities need every leg's book
        for event in events:
            for raw in event.get("markets") or []:
                m = Market.from_gamma(raw)
                if m and m.active and not m.closed:
                    add(m)
        # then: markets whose indicative YES bid+ask already hints at
        # complement mispricing, and near-resolution favorites
        scored: list[tuple[float, Market]] = []
        for m in markets:
            if m.best_bid is None or m.best_ask is None:
                continue
            # complement hint: implied NO ask = 1 - YES bid
            pair = m.best_ask + (1.0 - m.best_bid)
            hint = 1.0 - pair  # > 0 means YES ask + NO ask < 1 indicatively
            days = days_until(m.end_date)
            fav = (max(m.best_bid, 1.0 - m.best_ask) >= stcfg.value_min_price
                   and days is not None and days <= stcfg.value_max_days_to_end)
            score = hint + (0.001 if fav else -0.5)
            if hint > -0.02 or fav:
                scored.append((score, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        for _, m in scored:
            if len(tokens) >= self.config.scanner.book_top_n * 2:
                break
            add(m)
        return tokens

    def scan(self) -> list[Opportunity]:
        scfg = self.config.scanner
        markets = self.gamma.active_markets(
            pages=scfg.market_pages, min_volume_24h=scfg.min_volume_24h)
        events = self.gamma.negrisk_events() if self.config.strategies.negrisk_enabled else []
        log.info("scan: %d markets, %d negRisk events", len(markets), len(events))

        tokens = self._candidate_tokens(markets, events)
        books: dict[str, OrderBook] = self.clob.books(tokens) if tokens else {}
        log.info("fetched %d order books", len(books))

        opportunities: list[Opportunity] = []
        for strat in self.strategies:
            try:
                found = strat.find(markets, books, events)
            except Exception:
                log.exception("strategy %s crashed; skipping this cycle", strat.name)
                continue
            opportunities.extend(found)

        # guaranteed arbs first, then by edge
        opportunities.sort(key=lambda o: (not o.guaranteed, -o.edge))
        return opportunities
