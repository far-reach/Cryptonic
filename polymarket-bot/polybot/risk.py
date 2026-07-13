"""Risk manager: the only component allowed to size or veto a trade.

Hard rules for a $100 bankroll:
  - never deploy more than max_deployed_frac of the bankroll
  - cap any single opportunity at max_trade_usdc
  - cap total exposure to one market at max_market_usdc
  - halt everything on drawdown (halt_drawdown_frac) or daily loss stop
  - never repeat the same opportunity key
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .config import Config
from .models import Opportunity
from .portfolio import Portfolio

log = logging.getLogger(__name__)


@dataclass
class RiskDecision:
    approved: bool
    reason: str
    scale: float = 1.0  # multiply opportunity size by this


class RiskManager:
    def __init__(self, config: Config, portfolio: Portfolio):
        self.config = config
        self.portfolio = portfolio
        self.seen_keys: set[str] = set(portfolio.state.get("seen_keys", []))

    def halted(self) -> str | None:
        risk = self.config.risk
        equity = self.portfolio.equity()
        floor = risk.bankroll_usdc * (1.0 - risk.halt_drawdown_frac)
        if equity < floor:
            return f"HALT: equity ${equity:.2f} below drawdown floor ${floor:.2f}"
        if self.portfolio.realized_pnl_today() <= -risk.daily_loss_stop_usdc:
            return "HALT: daily loss stop hit"
        return None

    def check(self, opp: Opportunity) -> RiskDecision:
        risk = self.config.risk
        halt = self.halted()
        if halt:
            return RiskDecision(False, halt)
        if opp.key in self.seen_keys:
            return RiskDecision(False, "duplicate opportunity")
        if opp.total_cost <= 0:
            return RiskDecision(False, "zero-cost opportunity (malformed)")

        cash = self.portfolio.cash
        deployed = self.portfolio.deployed()
        max_deploy = risk.bankroll_usdc * risk.max_deployed_frac
        headroom = min(cash, max_deploy - deployed)
        if headroom < 1.0:
            return RiskDecision(False, f"deployed cap reached (${deployed:.2f} in market)")

        if (not opp.guaranteed
                and self.portfolio.open_position_count() >= risk.max_value_positions):
            return RiskDecision(False, "max value positions open")

        # per-market cap: existing exposure to any market these legs touch
        cap = risk.max_trade_usdc
        for leg in opp.legs:
            existing = self.portfolio.market_exposure(leg.market_question)
            cap = min(cap, risk.max_market_usdc - existing)
        cap = min(cap, headroom)
        if cap < 1.0:
            return RiskDecision(False, "per-market exposure cap reached")

        scale = min(1.0, cap / opp.total_cost)
        if opp.total_cost * scale < 1.0:
            return RiskDecision(False, "sized below $1 minimum")
        return RiskDecision(True, "ok", scale)

    def mark_taken(self, opp: Opportunity) -> None:
        self.seen_keys.add(opp.key)
        self.portfolio.state["seen_keys"] = sorted(self.seen_keys)
