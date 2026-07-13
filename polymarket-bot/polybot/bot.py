"""Main trading loop: scan -> risk-check -> execute -> repeat."""

from __future__ import annotations

import logging
import time

from .config import Config
from .executor.base import Executor
from .executor.paper import PaperExecutor
from .fees import FeeModel
from .portfolio import Portfolio
from .risk import RiskManager
from .scanner import Scanner

log = logging.getLogger(__name__)


class Bot:
    def __init__(self, config: Config, scanner: Scanner | None = None,
                 executor: Executor | None = None,
                 portfolio: Portfolio | None = None):
        self.config = config
        self.portfolio = portfolio or Portfolio(config.risk.bankroll_usdc,
                                                config.state_file)
        self.scanner = scanner or Scanner(config)
        self.fees = FeeModel(config.fee_overrides)
        self.risk = RiskManager(config, self.portfolio)
        if executor is not None:
            self.executor = executor
        elif config.mode == "live":
            from .executor.live import LiveExecutor
            self.executor = LiveExecutor(config, self.portfolio, self.fees)
        else:
            self.executor = PaperExecutor(self.portfolio, self.fees)

    def run_once(self) -> int:
        """One scan/trade cycle. Returns number of trades executed."""
        halt = self.risk.halted()
        if halt:
            log.warning(halt)
            return 0
        trades = 0
        for opp in self.scanner.scan():
            decision = self.risk.check(opp)
            if not decision.approved:
                log.debug("skip %s: %s", opp.kind, decision.reason)
                continue
            log.info("taking %s (scale %.2f)", opp.summary(), decision.scale)
            result = self.executor.execute(opp, decision.scale)
            if result.success:
                self.risk.mark_taken(opp)
                self.portfolio.save()
                trades += 1
            else:
                log.warning("execution failed: %s", result.detail)
        return trades

    def run_forever(self) -> None:
        log.info("bot starting: mode=%s bankroll=$%.2f",
                 self.config.mode, self.config.risk.bankroll_usdc)
        while True:
            try:
                n = self.run_once()
                eq = self.portfolio.equity()
                log.info("cycle done: %d trade(s), cash=$%.2f equity>=$%.2f",
                         n, self.portfolio.cash, eq)
            except ConnectionError as e:
                log.warning("network trouble, will retry: %s", e)
            except KeyboardInterrupt:
                log.info("stopping on Ctrl-C")
                break
            except Exception:
                log.exception("cycle crashed; continuing")
            if self.risk.halted():
                log.warning("risk halt active — exiting loop")
                break
            time.sleep(self.config.scanner.poll_seconds)
