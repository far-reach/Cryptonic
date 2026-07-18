"""Main trading loop.

Cycle order matters — each step frees or protects capital for the next:
  1. scan (books include every token we hold or quote)
  2. mark-to-market: fresh best bids feed the drawdown halt
  3. settlement check (every settle_every_cycles) — credits resolved wins
  4. sync resting orders (book maker fills)
  5. merge completed YES+NO maker pairs back to cash (paper)
  6. inventory control: stop out runaway UNPAIRED maker inventory
  7. value stop-losses
  8. maker quote management (cancel stale / requote / place new; markets
     that just stopped out are in cooldown)
  9. taker opportunities (arbs, value entries) through the risk gate

Adaptive polling: fast cycles only after real activity (fills, placements,
taker trades), capped at hot_max_cycles consecutive fast cycles so a
persistent-but-blocked opportunity can never latch the fast loop forever.
"""

from __future__ import annotations

import logging
import time

from .config import Config
from .executor.base import Executor
from .executor.paper import PaperExecutor
from .fees import FeeModel
from .models import Fill, Leg, Opportunity, OrderBook, Position
from .portfolio import Portfolio, now_iso
from .risk import RiskManager
from .scanner import Scanner, ScanResult
from .settlement import SettlementChecker

log = logging.getLogger(__name__)

EXIT_FLOOR_TICKS = 2  # exits accept prices down to best_bid - 2 ticks


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
        self.settlement = SettlementChecker(getattr(self.scanner, "gamma", None),
                                            self.portfolio)
        self._cycle = 0
        self._hot = False
        self._hot_streak = 0
        self._quote_cooldown: dict[str, int] = {}  # condition_id -> cycle until
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

    def _maker_pairs(self) -> dict[str, tuple[Position | None, Position | None]]:
        """condition_id -> (yes_position, no_position) for maker positions."""
        out: dict[str, list] = {}
        for p in self.portfolio.positions():
            if p.strategy == "market_maker" and p.condition_id:
                out.setdefault(p.condition_id, [None, None])
                out[p.condition_id][0 if p.outcome == "Yes" else 1] = p
        return {k: (v[0], v[1]) for k, v in out.items()}

    def _unpaired_shares(self, pos: Position) -> float:
        """Shares of `pos` NOT hedged by the complementary maker position.
        A YES+NO pair is a locked $1 — it must never be stopped out or
        counted against the inventory cap."""
        yes, no = self._maker_pairs().get(pos.condition_id, (None, None))
        other = no if pos.outcome == "Yes" else yes
        hedged = min(pos.shares, other.shares if other else 0.0)
        return pos.shares - hedged

    def _unpaired_inventory_cost(self, condition_id: str) -> float:
        yes, no = self._maker_pairs().get(condition_id, (None, None))
        y_sh = yes.shares if yes else 0.0
        n_sh = no.shares if no else 0.0
        paired = min(y_sh, n_sh)
        cost = 0.0
        if yes and y_sh > paired:
            cost += (y_sh - paired) * yes.avg_price
        if no and n_sh > paired:
            cost += (n_sh - paired) * no.avg_price
        return cost

    def _merge_maker_pairs(self) -> float:
        """Convert completed YES+NO pairs (same market) back into cash at $1.

        Paper mode only — live pairs stay until resolution/settlement (merging
        on-chain needs a CTF transaction the CLOB client doesn't expose; the
        README documents manual merge via the UI for capital efficiency).
        """
        if self.config.mode == "live":
            return 0.0
        merged = 0.0
        for cid, (yes, no) in self._maker_pairs().items():
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
        """Dump UNPAIRED maker inventory that ran away from us. Stopped
        markets enter a quoting cooldown so we don't churn re-entries."""
        cfg = self.config.strategies
        exits = 0
        for p in self.portfolio.positions():
            if p.strategy != "market_maker":
                continue
            unpaired = self._unpaired_shares(p)
            if unpaired <= 1e-9:
                continue
            ob = books.get(p.token_id)
            if not ob or not ob.best_bid:
                continue
            if p.avg_price - ob.best_bid.price >= cfg.maker_inventory_stop - 1e-9:
                if self._exit_position(p, ob, "maker_inventory_stop",
                                       max_shares=unpaired):
                    self._quote_cooldown[p.condition_id] = (
                        self._cycle + cfg.maker_stop_cooldown_cycles)
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
            if p.avg_price - ob.best_bid.price >= cfg.value_stop_loss - 1e-9:
                if self._exit_position(p, ob, "value_stop_loss"):
                    exits += 1
        return exits

    def _exit_position(self, pos, ob: OrderBook, reason: str,
                       max_shares: float | None = None) -> bool:
        """Sell into the book DEPTH-AWARE: only the shares fillable at
        acceptable prices (>= best_bid - 2 ticks), booked at the walked
        average. Any remainder is retried next cycle."""
        want = min(pos.shares, max_shares if max_shares is not None else pos.shares)
        floor = max(0.01, ob.best_bid.price - EXIT_FLOOR_TICKS * 0.01)
        fillable, proceeds = 0.0, 0.0
        for level in ob.bids:
            if level.price < floor - 1e-9:
                break
            take = min(want - fillable, level.size)
            fillable += take
            proceeds += take * level.price
            if fillable >= want - 1e-9:
                break
        if fillable <= 1e-9:
            log.warning("STOP wanted but book too thin for %s (%s)",
                        pos.market_question[:50], reason)
            return False
        avg = proceeds / fillable
        opp = Opportunity(
            strategy=reason, kind=reason,
            description=(f"EXIT {fillable:.1f} {pos.outcome} @ ~{avg:.3f} "
                         f"| {pos.market_question[:60]}"),
            legs=[Leg(pos.token_id, "SELL", floor, fillable,
                      pos.market_question, pos.outcome, "", pos.condition_id,
                      avg_price=avg)],
            edge=0.0, expected_profit=0.0,
            total_cost=0.0, guaranteed=False, key=f"{reason}:{pos.token_id}",
        )
        log.warning("STOP: %s (cost %.3f)", opp.description, pos.avg_price)
        return self.executor.execute(opp).success

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
            stale = want is None or halt is not None
            if want is not None and halt is None:
                # requote if our price drifted from the strategy's current
                # quote, measured in the MARKET'S OWN tick size
                tick = want.tick or 0.01
                drift = max(
                    (abs(next((l.price for l in want.legs
                               if l.token_id == o.token_id), o.price) - o.price)
                     for o in orders),
                    default=0.0)
                stale = drift >= cfg.maker_requote_ticks * tick - 1e-9
                # one side fully filled -> keep the other side resting (it
                # completes the pair at original economics) unless drifted
            if stale:
                for o in orders:
                    self.executor.cancel_order(o.order_id)
                open_by_quote.pop(quote_key, None)

        # 2) place quotes we want and don't have (both sides must be absent —
        #    a half-filled quote still owns its key until canceled)
        if halt is None:
            for quote_key, opp in desired.items():
                if quote_key in open_by_quote:
                    continue
                cid = opp.legs[0].condition_id
                if self._quote_cooldown.get(cid, 0) > self._cycle:
                    continue  # just stopped out here — don't churn back in
                # cap applies to UNPAIRED inventory only: hedged pairs are
                # locked profit, not risk
                if self._unpaired_inventory_cost(cid) >= cfg.maker_max_inventory_usdc:
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

        # mark-to-market: the drawdown halt must see real bids, not cost basis
        marks = {t: ob.best_bid.price
                 for t, ob in result.books.items() if ob.best_bid}
        self.risk.set_marks(marks)

        if self._cycle % max(1, self.config.scanner.settle_every_cycles) == 0:
            pnl = self.settlement.run()
            if pnl:
                log.info("settlement pass realized %+.2f", pnl)

        fills = self.executor.sync_orders(result.books)
        if fills:
            self._hot = True  # one-sided just now? react fast next cycle
        self._merge_maker_pairs()
        self._inventory_stops(result.books)
        self._value_stops(result.books)

        trades = self._manage_quotes(result)
        if trades:
            self._hot = True

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
        leftovers = []
        for o in self.portfolio.open_orders():
            if not self.executor.cancel_order(o.order_id):
                leftovers.append(o.order_id)
        if leftovers:
            log.error("%d order(s) could not be confirmed canceled — check "
                      "polymarket.com and re-run status", len(leftovers))
        self.portfolio.save()

    def run_forever(self) -> None:
        log.info("bot starting: mode=%s bankroll=$%.2f",
                 self.config.mode, self.config.risk.bankroll_usdc)
        scfg = self.config.scanner
        try:
            while True:
                try:
                    n = self.run_once()
                    eq = self.portfolio.equity()
                    log.info("cycle %d: %d action(s), cash=$%.2f reserved=$%.2f equity~$%.2f",
                             self._cycle, n, self.portfolio.cash,
                             self.portfolio.reserved, eq)
                except ConnectionError as e:
                    log.warning("network trouble, will retry: %s", e)
                    self._hot = False
                except Exception:
                    log.exception("cycle crashed; continuing")
                    self._hot = False
                if self.risk.halted():
                    log.warning("risk halt active — canceling quotes and exiting")
                    self.shutdown()
                    break
                # fast polling only after real activity, and never latched:
                # at most hot_max_cycles consecutive fast cycles
                if self._hot and self._hot_streak < scfg.hot_max_cycles:
                    self._hot_streak += 1
                    time.sleep(scfg.fast_poll_seconds)
                else:
                    self._hot_streak = 0
                    time.sleep(scfg.poll_seconds)
        except KeyboardInterrupt:
            log.info("stopping on Ctrl-C — canceling resting orders")
            self.shutdown()
