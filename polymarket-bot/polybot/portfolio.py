"""Portfolio state: cash, positions, fills, PnL. Persisted as JSON."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .models import Fill, Position

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Portfolio:
    def __init__(self, bankroll: float, state_file: str | None = None):
        self.state_file = Path(state_file) if state_file else None
        self.state: dict = {
            "cash": bankroll,
            "bankroll": bankroll,
            "positions": {},   # token_id -> position dict
            "fills": [],
            "realized_pnl": 0.0,
            "seen_keys": [],
        }
        if self.state_file and self.state_file.exists():
            try:
                self.state = json.loads(self.state_file.read_text())
            except (json.JSONDecodeError, OSError) as e:
                log.warning("could not load state file, starting fresh: %s", e)

    # -- accessors ---------------------------------------------------------
    @property
    def cash(self) -> float:
        return float(self.state["cash"])

    def positions(self) -> list[Position]:
        return [Position(**p) for p in self.state["positions"].values()]

    def open_position_count(self) -> int:
        return len(self.state["positions"])

    def deployed(self) -> float:
        return sum(p["shares"] * p["avg_price"] for p in self.state["positions"].values())

    def market_exposure(self, market_question: str) -> float:
        return sum(p["shares"] * p["avg_price"]
                   for p in self.state["positions"].values()
                   if p["market_question"] == market_question)

    def equity(self, marks: dict[str, float] | None = None) -> float:
        """Cash + positions. With no marks, positions are held at cost."""
        total = self.cash
        for token_id, p in self.state["positions"].items():
            mark = (marks or {}).get(token_id, p["avg_price"])
            total += p["shares"] * mark
        return total

    def realized_pnl_today(self) -> float:
        today = datetime.now(timezone.utc).date().isoformat()
        return sum(f.get("pnl", 0.0) for f in self.state["fills"]
                   if f["timestamp"][:10] == today and f["side"] == "SELL")

    # -- mutations ---------------------------------------------------------
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

    def _record(self, fill: Fill, pnl: float | None = None) -> None:
        entry = {
            "token_id": fill.token_id, "side": fill.side, "price": fill.price,
            "shares": fill.shares, "fee": fill.fee, "timestamp": fill.timestamp,
            "strategy": fill.strategy, "market_question": fill.market_question,
            "outcome": fill.outcome,
        }
        if pnl is not None:
            entry["pnl"] = pnl
        self.state["fills"].append(entry)
        self.save()

    def save(self) -> None:
        if self.state_file:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self.state_file.write_text(json.dumps(self.state, indent=2))


def now_iso() -> str:
    return _now()
