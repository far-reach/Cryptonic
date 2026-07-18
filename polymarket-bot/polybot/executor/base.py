"""Executor interface: taker fills + resting (maker) order lifecycle."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Opportunity, OrderBook


class ExecutionResult:
    def __init__(self, success: bool, detail: str = "", filled_cost: float = 0.0):
        self.success = success
        self.detail = detail
        self.filled_cost = filled_cost


class Executor(ABC):
    @abstractmethod
    def execute(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        """Cross the book now (taker)."""
        raise NotImplementedError

    @abstractmethod
    def place_maker(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        """Rest the opportunity's legs as GTC limit orders."""
        raise NotImplementedError

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool:
        """Cancel one resting order and release its reservation."""
        raise NotImplementedError

    @abstractmethod
    def sync_orders(self, books: dict[str, OrderBook]) -> int:
        """Reconcile resting orders with reality; returns number of fills."""
        raise NotImplementedError
