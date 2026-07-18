"""Main trading loop.

Cycle order matters — each step frees or protects capital for the next:
  1. scan (books include every token we hold or quote)
  2. settlement check (every settle_every_cycles) — credits resolved wins
  3. sync resting orders (book maker fills)
  4. merge completed YES+NO maker pairs back to cash (paper)
  5. inventory control: stop out runaway one-sided maker inventory
  6. value stop-losses
  7. maker quote management (cancel stale / requote / place new)
  8. taker opportunities (arbs, value entries) through the risk gate

Adaptive polling: after a cycle that traded or saw a near-miss arb, the
next scan runs at fast_poll_seconds instead of poll_seconds.
"""

from __future__ import annotations

import logging
import time

from .config import Config
from .executor.base import Executor
from .executor.paper import PaperExecutor
from .fees import FeeModel
from .models import Leg, Opportunity, OrderBook
from .portfolio import Portfolio
from .risk import RiskManager
from .scanner import Scanner, ScanResult
from .settlement import SettlementChecker

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
        self.settlement = SettlementChecker(self.scanner.gamma, self.portfolio)
        self._cycle = 0
        self._hot = False
        if executor is not None:
            self.executor = executor
        elif config.mode == "live":
            from .executor.live import LiveExecutor
            self.executor = LiveExecutor(config, self.portfolio, self.fees)
        else:
            self.executor = PaperExecutor(self.portfolio, self.fees)

    # ------------------------------------------------------------ helpers
    def _tracked_tokens(self) -> list[str]:
        tokens = [p.token_id for p in self.portfolio.positions()]
        tokens += [o.token_id for o in self.portfolio.open_orders()]
        return tokens

    def _merge_maker_pairs(self) -> float:
        """Convert completed YES+NO pairs (same market) back into cash at $1.

        Paper mode only — live pairs stay until resolution/settlement (merging
        on-chain needs a CTF transaction the CLOB client doesn't expose; the
        README documents manual merge via the UI for capital efficiency).
        """
        if self.config.mode == "live":
            return 0.0
        by_market: dict[str, list] = {}
        for p in self.portfolio.positions():
            if p.strategy == "market_maker" and p.condition_id:
                by_market.setdefault(p.condition_id, []).append(p)
        merged = 0.0
        for cid, ps in by_market.items():
            yes = next((p for p in ps if p.outcome == "Yes"), None)
            no = next((p for p in ps if p.outcome == "No"), None)
            if not yes or not no:
                continue
            n = min(yes.shares, no.shares)
            if n <= 1e-9:
                continue
            # split the $1 pair value cost-proportionally so both legs book
            # the same profit rate and total proceeds are exactly $1 * n
            total_cost = yes.avg_price + no.avg_price
            if total_cost <= 0:
                continue
            from .models import Fill
            from .portfolio import now_iso
            for pos, px in ((yes, yes.avg_price / total_cost),
                            (no, no.avg_price / total_cost)):
                self.portfolio.apply_sell(Fill(
                    token_id=pos.token_id, side="SELL", price=px, shares=n,
                    fee=0.0, timestamp=now_iso(), strategy="pair_merge",
                    market_question=pos.market_question, outcome=pos.outcome,
                    condition_id=cid))
            merged += n * (1.0 - total_cost)
            log.info("MERGED %.1f pairs of '%s' (profit %+.2f)",
                     n, yes.market_question[:50], n * (1.0 - total_cost))
        return merged

    def _inventory_stops(self, books: dict[str, OrderBook]) -> int:
        """Dump one-sided maker inventory that ran away from us."""
        cfg = self.config.strategies
        exits = 0
        for p in self.portfolio.positions():
            if p.strategy != "market_maker":
                continue
            ob = books.get(p.token_id)
            if not ob or not ob.best_bid:
                continue
            bid = ob.best_bid.price
            if p.avg_price - bid >= cfg.maker_inventory_stop:
                self._exit_position(p, bid, "maker_inventory_stop")
                exits += 1
        return exits

    def _value_stops(self, books: dict[str, OrderBook]) -> int:
        cfg = self.config.strategies
        exits = 0
        for p in self.portfolio.positions():
            if p.strategy != "value_favorites":
                continue
            ob = books.get(p.token_id)
            if not ob or not ob.best_bid:
                continue
            bid = ob.best_bid.price
            if p.avg_price - bid >= cfg.value_stop_loss:
                self._exit_position(p, bid, "value_stop_loss")
                exits += 1
        return exits

    def _exit_position(self, pos, bid_price: float, reason: str) -> None:
        opp = Opportunity(
            strategy=reason, kind=reason,
            description=f"EXIT {pos.outcome} @ {bid_price:.3f} | {pos.market_question[:60]}",
            legs=[Leg(pos.token_id, "SELL", bid_price, pos.shares,
                      pos.market_question, pos.outcome, "", pos.condition_id)],
            edge=0.0, expected_profit=0.0,
            total_cost=0.0, guaranteed=False, key=f"{reason}:{pos.token_id}",
        )
        log.warning("STOP: %s (cost %.3f -> bid %.3f)", opp.description,
                    pos.avg_price, bid_price)
        self.executor.execute(opp)

    # -------------------------------------------------------- maker quoting
    def _manage_quotes(self, result: ScanResult) -> int:
        """Cancel stale quotes, keep good ones, place new ones. Returns placements."""
        cfg = self.config.strategies
        desired: dict[str, Opportunity] = {
            o.key: o for o in result.opportunities if o.execution == "maker"}
        open_by_quote: dict[str, list] = {}
        for o in self.portfolio.open_orders():
            if o.strategy == "market_maker":
                open_by_quote.setdefault(o.quote_key, []).append(o)

        placements = 0
        halt = self.risk.halted()

        # 1) drop quotes for markets the strategy no longer wants (or on halt)
        for quote_key, orders in list(open_by_quote.items()):
            want = desired.get(quote_key)
            stale = want is None or halt
            if want is not None and not halt:
                # requote if our price drifted from the strategy's current quote
                tick = 0.01
                drift = max(
                    (abs(next((l.price for l in want.legs
                               if l.token_id == o.token_id), o.price) - o.price)
                     for o in orders),
                    default=0.0)
                stale = drift >= cfg.maker_requote_ticks * tick
                # one side fully filled -> keep the other side resting (it
                # completes the pair at original economics) unless drifted
            if stale:
                for o in orders:
                    self.executor.cancel_order(o.order_id)
                open_by_quote.pop(quote_key, None)

        # 2) place quotes we want and don't have (both sides must be absent —
        #    a half-filled quote still owns its key until canceled)
        if not halt:
            for quote_key, opp in desired.items():
                if quote_key in open_by_quote:
                    continue
                # respect per-market unpaired inventory cap before requoting
                inv = sum(p.cost_basis for p in self.portfolio.positions()
                          if p.strategy == "market_maker"
                          and p.condition_id == opp.legs[0].condition_id)
                if inv >= cfg.maker_max_inventory_usdc:
                    continue
                decision = self.risk.check(opp)
                if not decision.approved:
                    log.debug("maker skip %s: %s", quote_key, decision.reason)
                    continue
                res = self.executor.place_maker(opp, decision.scale)
                if res.success:
                    placements += 1
        return placements

    # --------------------------------------------------------------- cycle
    def run_once(self) -> int:
        """One full cycle. Returns number of taker trades + maker placements."""
        self._cycle += 1
        self._hot = False
        result = self.scanner.scan(extra_token_ids=self._tracked_tokens())

        if self._cycle % max(1, self.config.scanner.settle_every_cycles) == 0:
            pnl = self.settlement.run()
            if pnl:
                log.info("settlement pass realized %+.2f", pnl)

        self.executor.sync_orders(result.books)
        self._merge_maker_pairs()
        self._inventory_stops(result.books)
        self._value_stops(result.books)

        trades = self._manage_quotes(result)

        halt = self.risk.halted()
        if halt:
            log.warning(halt)
            self.portfolio.save()
            return trades

        for opp in result.opportunities:
            if opp.execution == "maker":
                continue
            decision = self.risk.check(opp)
            if not decision.approved:
                if opp.guaranteed and 0 < opp.edge:
                    self._hot = True  # arb exists but blocked; watch closely
                log.debug("skip %s: %s", opp.kind, decision.reason)
                continue
            log.info("taking %s (scale %.2f)", opp.summary(), decision.scale)
            res = self.executor.execute(opp, decision.scale)
            if res.success:
                self.risk.mark_taken(opp)
                trades += 1
                self._hot = True
            else:
                log.warning("execution failed: %s", res.detail)
        self.portfolio.save()
        return trades

    def shutdown(self) -> None:
        """Cancel all resting orders (halt or Ctrl-C)."""
        for o in self.portfolio.open_orders():
            self.executor.cancel_order(o.order_id)
        self.portfolio.save()

    def run_forever(self) -> None:
        log.info("bot starting: mode=%s bankroll=$%.2f",
                 self.config.mode, self.config.risk.bankroll_usdc)
        try:
            while True:
                try:
                    n = self.run_once()
                    eq = self.portfolio.equity()
                    log.info("cycle %d: %d action(s), cash=$%.2f reserved=$%.2f equity>=$%.2f",
                             self._cycle, n, self.portfolio.cash,
                             self.portfolio.reserved, eq)
                except ConnectionError as e:
                    log.warning("network trouble, will retry: %s", e)
                except Exception:
                    log.exception("cycle crashed; continuing")
                if self.risk.halted():
                    log.warning("risk halt active — canceling quotes and exiting")
                    self.shutdown()
                    break
                sleep = (self.config.scanner.fast_poll_seconds if self._hot
                         else self.config.scanner.poll_seconds)
                time.sleep(sleep)
        except KeyboardInterrupt:
            log.info("stopping on Ctrl-C — canceling resting orders")
            self.shutdown()
