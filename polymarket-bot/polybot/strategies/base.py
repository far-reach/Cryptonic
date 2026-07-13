"""Strategy interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..config import Config
from ..fees import FeeModel
from ..models import Market, Opportunity, OrderBook


class Strategy(ABC):
    name = "base"

    def __init__(self, config: Config, fees: FeeModel):
        self.config = config
        self.fees = fees

    @abstractmethod
    def find(self, markets: list[Market], books: dict[str, OrderBook],
             events: list[dict]) -> list[Opportunity]:
        """Return opportunities. Must be side-effect free (pure scan)."""
        raise NotImplementedError
