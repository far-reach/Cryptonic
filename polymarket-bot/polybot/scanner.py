"""Scanner: pull market data, run every strategy, rank opportunities."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from .api import ClobClient, GammaClient
from .config import Config
from .fees import FeeModel
from .models import Market, Opportunity, OrderBook
from .strategies.base import Strategy
from .strategies.complement_arb import ComplementArb
from .strategies.market_maker import MarketMaker
from .strategies.negrisk_arb import NegRiskArb
from .strategies.value import ValueFavorites, days_until

log = logging.getLogger(__name__)


@dataclass
class ScanResult:
    opportunities: list[Opportunity] = field(default_factory=list)
    books: dict[str, OrderBook] = field(default_factory=dict)
    markets: list[Market] = field(default_factory=list)


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
            MarketMaker(config, self.fees),
        ]

    def _candidate_tokens(self, markets: list[Market], events: list[dict]) -> list[str]:
        """Pick which order books to fetch this cycle (bounded by book_top_n)."""
        stcfg = self.config.strategies
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
        # then, scored: complement hints, near-resolution favorites, and
        # maker candidates (busy mid-range markets with a wide spread)
        scored: list[tuple[float, Market]] = []
        for m in markets:
            if m.best_bid is None or m.best_ask is None:
                continue
            pair = m.best_ask + (1.0 - m.best_bid)  # indicative YES+NO ask sum
            hint = 1.0 - pair
            days = days_until(m.end_date)
            fav = (max(m.best_bid, 1.0 - m.best_ask) >= stcfg.value_min_price
                   and days is not None and days <= stcfg.value_max_days_to_end)
            mid = (m.best_bid + m.best_ask) / 2
            spread = m.best_ask - m.best_bid
            makerish = (stcfg.maker_enabled
                        and m.volume_24h >= stcfg.maker_min_volume_24h
                        and stcfg.maker_mid_low <= mid <= stcfg.maker_mid_high
                        and spread >= stcfg.maker_min_spread
                        and days is not None
                        and days >= stcfg.maker_min_days_to_end)
            score = hint + (0.001 if fav else 0.0) + (m.volume_24h / 1e9 if makerish else 0.0)
            if hint > -0.02 or fav or makerish:
                scored.append((score, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        for _, m in scored:
            if len(tokens) >= self.config.scanner.book_top_n * 2:
                break
            add(m)
        return tokens

    def scan(self, extra_token_ids: list[str] | None = None) -> ScanResult:
        """Full cycle: metadata, books (incl. `extra_token_ids` — held/quoted
        tokens the bot must track), strategies."""
        scfg = self.config.scanner
        markets = self.gamma.active_markets(
            pages=scfg.market_pages, min_volume_24h=scfg.min_volume_24h)
        events = self.gamma.negrisk_events() if self.config.strategies.negrisk_enabled else []
        log.info("scan: %d markets, %d negRisk events", len(markets), len(events))

        tokens = self._candidate_tokens(markets, events)
        for t in extra_token_ids or []:
            if t and t not in tokens:
                tokens.append(t)
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

        # guaranteed arbs first, then takers by edge, maker quotes last
        opportunities.sort(
            key=lambda o: (not o.guaranteed, o.execution == "maker", -o.edge))
        return ScanResult(opportunities=opportunities, books=books, markets=markets)
