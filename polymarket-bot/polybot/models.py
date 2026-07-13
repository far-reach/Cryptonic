"""Core data models shared across the bot."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class BookLevel:
    price: float
    size: float  # number of shares


@dataclass
class OrderBook:
    """One outcome token's order book (CLOB /book)."""

    token_id: str
    bids: list[BookLevel] = field(default_factory=list)  # sorted best (highest) first
    asks: list[BookLevel] = field(default_factory=list)  # sorted best (lowest) first

    @property
    def best_bid(self) -> Optional[BookLevel]:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Optional[BookLevel]:
        return self.asks[0] if self.asks else None

    @property
    def midpoint(self) -> Optional[float]:
        if self.bids and self.asks:
            return (self.bids[0].price + self.asks[0].price) / 2
        return None

    @property
    def spread(self) -> Optional[float]:
        if self.bids and self.asks:
            return self.asks[0].price - self.bids[0].price
        return None

    def buy_cost(self, shares: float) -> Optional[float]:
        """USDC cost to buy `shares` by walking the asks. None if not enough depth."""
        remaining, cost = shares, 0.0
        for level in self.asks:
            take = min(remaining, level.size)
            cost += take * level.price
            remaining -= take
            if remaining <= 1e-9:
                return cost
        return None

    def depth_at_best_ask(self) -> float:
        return self.asks[0].size if self.asks else 0.0

    @classmethod
    def from_clob(cls, data: dict) -> "OrderBook":
        """Parse a CLOB /book response. Bids/asks arrive unsorted in some cases."""
        bids = [BookLevel(float(b["price"]), float(b["size"])) for b in data.get("bids", [])]
        asks = [BookLevel(float(a["price"]), float(a["size"])) for a in data.get("asks", [])]
        bids.sort(key=lambda l: l.price, reverse=True)
        asks.sort(key=lambda l: l.price)
        return cls(token_id=str(data.get("asset_id", "")), bids=bids, asks=asks)


@dataclass
class Market:
    """A binary Polymarket market (one question, YES/NO outcome tokens)."""

    condition_id: str
    question: str
    slug: str = ""
    yes_token_id: str = ""
    no_token_id: str = ""
    outcomes: list[str] = field(default_factory=lambda: ["Yes", "No"])
    best_bid: Optional[float] = None   # for YES token
    best_ask: Optional[float] = None   # for YES token
    volume_24h: float = 0.0
    liquidity: float = 0.0
    end_date: str = ""                 # ISO 8601
    neg_risk: bool = False
    event_slug: str = ""
    event_title: str = ""
    category: str = ""                 # used for fee lookup
    active: bool = True
    closed: bool = False
    tick_size: float = 0.01

    @classmethod
    def from_gamma(cls, m: dict) -> Optional["Market"]:
        """Parse a Gamma /markets item. Returns None for malformed entries.

        Gamma serializes list fields (clobTokenIds, outcomes) as JSON *strings*.
        """
        try:
            token_ids = m.get("clobTokenIds") or "[]"
            if isinstance(token_ids, str):
                token_ids = json.loads(token_ids)
            outcomes = m.get("outcomes") or '["Yes", "No"]'
            if isinstance(outcomes, str):
                outcomes = json.loads(outcomes)
            if len(token_ids) != 2:
                return None
            events = m.get("events") or []
            event = events[0] if events else {}
            return cls(
                condition_id=m.get("conditionId", ""),
                question=m.get("question", ""),
                slug=m.get("slug", ""),
                yes_token_id=str(token_ids[0]),
                no_token_id=str(token_ids[1]),
                outcomes=[str(o) for o in outcomes],
                best_bid=float(m["bestBid"]) if m.get("bestBid") is not None else None,
                best_ask=float(m["bestAsk"]) if m.get("bestAsk") is not None else None,
                volume_24h=float(m.get("volume24hr") or 0.0),
                liquidity=float(m.get("liquidityNum") or m.get("liquidity") or 0.0),
                end_date=m.get("endDate", "") or "",
                neg_risk=bool(m.get("negRisk", False)),
                event_slug=event.get("slug", ""),
                event_title=event.get("title", ""),
                category=(m.get("category") or event.get("category") or "").lower(),
                active=bool(m.get("active", True)),
                closed=bool(m.get("closed", False)),
                tick_size=float(m.get("orderPriceMinTickSize") or 0.01),
            )
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None


@dataclass
class Leg:
    """One order that an opportunity requires."""

    token_id: str
    side: str            # "BUY" or "SELL"
    price: float         # limit price (worst acceptable)
    shares: float
    market_question: str = ""
    outcome: str = ""
    category: str = ""  # fee category of the market

    @property
    def notional(self) -> float:
        return self.price * self.shares


@dataclass
class Opportunity:
    """A trade (or bundle of legs) a strategy wants to execute."""

    strategy: str
    kind: str                     # e.g. "complement_arb", "negrisk_yes_arb", "value"
    description: str
    legs: list[Leg]
    edge: float                   # expected profit per $1 of guaranteed payout (arb) or per share (value)
    expected_profit: float        # USDC, after estimated fees, at the proposed size
    total_cost: float             # USDC outlay including estimated fees
    guaranteed: bool = False      # True for true arbitrage (payout locked at resolution)
    confidence: float = 1.0       # 0..1, strategies below 1 are probabilistic
    end_date: str = ""
    key: str = ""                 # dedupe key so we don't re-enter the same opp

    def summary(self) -> str:
        tag = "ARB " if self.guaranteed else "VALUE"
        return (
            f"[{tag}] {self.description} | edge={self.edge:.2%} "
            f"cost=${self.total_cost:.2f} -> +${self.expected_profit:.2f}"
        )


@dataclass
class Position:
    token_id: str
    market_question: str
    outcome: str
    shares: float
    avg_price: float
    strategy: str
    opened_at: str = ""
    end_date: str = ""

    @property
    def cost_basis(self) -> float:
        return self.shares * self.avg_price


@dataclass
class Fill:
    token_id: str
    side: str
    price: float
    shares: float
    fee: float
    timestamp: str
    strategy: str
    market_question: str = ""
    outcome: str = ""
