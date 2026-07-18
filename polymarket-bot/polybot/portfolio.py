"""Portfolio state: cash, positions, resting orders, fills, PnL.

Persisted as JSON so the bot survives restarts without double-trading.
Cash accounting: a resting BUY order reserves its cost up front (moved to
`reserved`), so open orders can never over-commit the bankroll; canceling
releases the reservation, a fill converts it into a position.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .models import Fill, OpenOrder, Position

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Portfolio:
    def __init__(self, bankroll: float, state_file: str | None = None):
        self.state_file = Path(state_file) if state_file else None
        self.state: dict = {
            "cash": bankroll,
            "reserved": 0.0,       # cash locked by resting BUY orders
            "bankroll": bankroll,
            "positions": {},       # token_id -> position dict
            "open_orders": {},     # order_id -> open order dict
            "fills": [],
            "realized_pnl": 0.0,
            "seen_keys": [],
        }
        if self.state_file and self.state_file.exists():
            try:
                loaded = json.loads(self.state_file.read_text())
                loaded.setdefault("reserved", 0.0)
                loaded.setdefault("open_orders", {})
                self.state = loaded
            except (json.JSONDecodeError, OSError) as e:
                log.warning("could not load state file, starting fresh: %s", e)

    # -- accessors ---------------------------------------------------------
    @property
    def cash(self) -> float:
        """Free cash (reservations for resting orders already excluded)."""
        return float(self.state["cash"])

    @property
    def reserved(self) -> float:
        return float(self.state["reserved"])

    def positions(self) -> list[Position]:
        return [Position(**p) for p in self.state["positions"].values()]

    def open_orders(self) -> list[OpenOrder]:
        return [OpenOrder(**o) for o in self.state["open_orders"].values()]

    def open_position_count(self, strategy: str | None = None) -> int:
        if strategy is None:
            return len(self.state["positions"])
        return sum(1 for p in self.state["positions"].values()
                   if p["strategy"] == strategy)

    def deployed(self) -> float:
        """Capital at work: positions at cost + cash reserved by resting orders."""
        return (sum(p["shares"] * p["avg_price"]
                    for p in self.state["positions"].values())
                + self.reserved)

    def market_exposure(self, condition_id: str, market_question: str = "") -> float:
        """Cost-basis exposure to one market, positions + resting orders."""
        def _match(d: dict) -> bool:
            if condition_id and d.get("condition_id"):
                return d["condition_id"] == condition_id
            return bool(market_question) and d.get("market_question") == market_question

        total = sum(p["shares"] * p["avg_price"]
                    for p in self.state["positions"].values() if _match(p))
        total += sum(o["shares"] * o["price"]
                     for o in self.state["open_orders"].values()
                     if o["side"] == "BUY" and _match(o))
        return total

    def equity(self, marks: dict[str, float] | None = None) -> float:
        """Cash + reserved + positions. Without marks, positions are at cost."""
        total = self.cash + self.reserved
        for token_id, p in self.state["positions"].items():
            mark = (marks or {}).get(token_id, p["avg_price"])
            total += p["shares"] * mark
        return total

    def realized_pnl_today(self) -> float:
        today = datetime.now(timezone.utc).date().isoformat()
        return sum(f.get("pnl", 0.0) for f in self.state["fills"]
                   if f["timestamp"][:10] == today and f["side"] == "SELL")

    # -- open (resting) orders --------------------------------------------
    def add_open_order(self, order: OpenOrder) -> None:
        if order.side == "BUY":
            cost = order.price * order.shares
            if cost > self.cash + 1e-9:
                raise ValueError(f"order cost ${cost:.2f} exceeds free cash ${self.cash:.2f}")
            self.state["cash"] = self.cash - cost
            self.state["reserved"] = self.reserved + cost
        self.state["open_orders"][order.order_id] = order.__dict__.copy()
        self.save()

    def cancel_open_order(self, order_id: str) -> None:
        o = self.state["open_orders"].pop(order_id, None)
        if o and o["side"] == "BUY":
            refund = o["price"] * o["shares"]
            self.state["reserved"] = max(0.0, self.reserved - refund)
            self.state["cash"] = self.cash + refund
        self.save()

    def fill_open_order(self, order_id: str, shares: float, fee: float = 0.0) -> None:
        """Convert (part of) a resting order into a position/sale."""
        o = self.state["open_orders"].get(order_id)
        if not o:
            raise ValueError(f"unknown open order {order_id}")
        shares = min(shares, o["shares"])
        if o["side"] == "BUY":
            # release reservation for the filled part, then book the buy
            release = o["price"] * shares
            self.state["reserved"] = max(0.0, self.reserved - release)
            self.state["cash"] = self.cash + release
            self.apply_buy(Fill(
                token_id=o["token_id"], side="BUY", price=o["price"],
                shares=shares, fee=fee, timestamp=_now(), strategy=o["strategy"],
                market_question=o["market_question"], outcome=o["outcome"],
                condition_id=o.get("condition_id", ""),
            ))
        else:
            self.apply_sell(Fill(
                token_id=o["token_id"], side="SELL", price=o["price"],
                shares=shares, fee=fee, timestamp=_now(), strategy=o["strategy"],
                market_question=o["market_question"], outcome=o["outcome"],
                condition_id=o.get("condition_id", ""),
            ))
        o["shares"] -= shares
        if o["shares"] <= 1e-9:
            del self.state["open_orders"][order_id]
        self.save()

    # -- position mutations ------------------------------------------------
    def apply_buy(self, fill: Fill) -> None:
        cost = fill.price * fill.shares + fill.fee
        if cost > self.cash + 1e-9:
            raise ValueError(f"buy cost ${cost:.2f} exceeds cash ${self.cash:.2f}")
        self.state["cash"] = self.cash - cost
        pos = self.state["positions"].get(fill.token_id)
        if pos:
            total_shares = pos["shares"] + fill.shares
            pos["avg_price"] = ((pos["shares"] * pos["avg_price"]
                                 + fill.shares * fill.price + fill.fee) / total_shares)
            pos["shares"] = total_shares
            if not pos.get("condition_id"):
                pos["condition_id"] = fill.condition_id
        else:
            self.state["positions"][fill.token_id] = {
                "token_id": fill.token_id,
                "market_question": fill.market_question,
                "outcome": fill.outcome,
                "shares": fill.shares,
                # fold the entry fee into cost basis
                "avg_price": (fill.price * fill.shares + fill.fee) / fill.shares,
                "strategy": fill.strategy,
                "opened_at": fill.timestamp,
                "end_date": "",
                "condition_id": fill.condition_id,
            }
        self._record(fill)

    def apply_sell(self, fill: Fill) -> float:
        """Sell (or settle at $1/$0). Returns realized PnL."""
        pos = self.state["positions"].get(fill.token_id)
        if not pos or pos["shares"] < fill.shares - 1e-9:
            raise ValueError(f"selling more than held for {fill.token_id[:16]}")
        proceeds = fill.price * fill.shares - fill.fee
        pnl = proceeds - pos["avg_price"] * fill.shares
        self.state["cash"] = self.cash + proceeds
        self.state["realized_pnl"] = float(self.state["realized_pnl"]) + pnl
        pos["shares"] -= fill.shares
        if pos["shares"] <= 1e-9:
            del self.state["positions"][fill.token_id]
        self._record(fill, pnl=pnl)
        return pnl

    def settle_position(self, token_id: str, won: bool, strategy_note: str = "settlement") -> float:
        """Resolve a position at $1 (won) or $0 (lost). Redemption is fee-free."""
        pos = self.state["positions"].get(token_id)
        if not pos:
            return 0.0
        return self.apply_sell(Fill(
            token_id=token_id, side="SELL", price=1.0 if won else 0.0,
            shares=pos["shares"], fee=0.0, timestamp=_now(),
            strategy=strategy_note, market_question=pos["market_question"],
            outcome=pos["outcome"], condition_id=pos.get("condition_id", ""),
        ))

    def _record(self, fill: Fill, pnl: float | None = None) -> None:
        entry = {
            "token_id": fill.token_id, "side": fill.side, "price": fill.price,
            "shares": fill.shares, "fee": fill.fee, "timestamp": fill.timestamp,
            "strategy": fill.strategy, "market_question": fill.market_question,
            "outcome": fill.outcome, "condition_id": fill.condition_id,
        }
        if pnl is not None:
            entry["pnl"] = pnl
        self.state["fills"].append(entry)
        self.save()

    def save(self) -> None:
        if self.state_file:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.state_file.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.state, indent=2))
            tmp.replace(self.state_file)


def now_iso() -> str:
    return _now()
