"""Executor interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Opportunity


class ExecutionResult:
    def __init__(self, success: bool, detail: str = "", filled_cost: float = 0.0):
        self.success = success
        self.detail = detail
        self.filled_cost = filled_cost


class Executor(ABC):
    @abstractmethod
    def execute(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        raise NotImplementedError
