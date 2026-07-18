"""Live executor: real orders on the Polymarket CLOB (V2).

Requires:
  pip install py-clob-client-v2
  POLYMARKET_PRIVATE_KEY      — wallet key (0x…), NEVER commit this
  POLYMARKET_FUNDER_ADDRESS   — proxy wallet holding USDC (Polymarket profile
                                address); leave empty for a plain EOA
  POLYMARKET_SIGNATURE_TYPE   — 0=EOA, 1=email/Magic login, 2=browser wallet
  POLYBOT_LIVE_ACK=I_UNDERSTAND_THE_RISKS  — explicit opt-in gate

Execution model:
- Taker legs are LIMIT orders sent Fill-Or-Kill, sized in shares at the
  leg's worst acceptable (limit) price: the leg either fills completely at
  or better than that price, or not at all — the price cap is real and the
  share count booked locally equals the share count ordered.
- Every exchange-confirmed fill is booked unconditionally (force=True):
  a fill that happened on-chain can never be rejected by local accounting.
- A failed later leg triggers an unwind of already-filled legs at an
  aggressive limit floor, and the unwind sells ARE booked to the ledger so
  leg-risk losses count toward the daily loss stop.
- Maker legs are GTC limit orders tracked in the portfolio. cancel_order
  reconciles matched size via get_order BEFORE releasing the reservation;
  on any uncertainty the order stays tracked and sync_orders retries.
"""

from __future__ import annotations

import inspect
import logging
import math
import os

from ..config import CLOB_HOST, POLYGON_CHAIN_ID, Config
from ..fees import FeeModel
from ..models import Fill, Leg, OpenOrder, Opportunity, OrderBook
from ..portfolio import Portfolio, now_iso
from .base import ExecutionResult, Executor

log = logging.getLogger(__name__)

ACK_ENV = "POLYBOT_LIVE_ACK"
ACK_VALUE = "I_UNDERSTAND_THE_RISKS"

UNWIND_FLOOR_DROP = 0.15   # unwind sells at (fill price - this), min 0.01
STATUS_FAIL_LIMIT = 5      # consecutive status-poll failures before loud error


def _floor2(x: float) -> float:
    """Round DOWN to cents — rounding up can overshoot risk-approved caps."""
    return math.floor(x * 100 + 1e-9) / 100


class LiveExecutor(Executor):
    def __init__(self, config: Config, portfolio: Portfolio, fees: FeeModel):
        if os.environ.get(ACK_ENV) != ACK_VALUE:
            raise RuntimeError(
                f"Live trading requires {ACK_ENV}={ACK_VALUE} in the environment. "
                "Run in paper mode until you have read the README's risk section."
            )
        if not config.private_key:
            raise RuntimeError("POLYMARKET_PRIVATE_KEY is not set")
        try:
            from py_clob_client_v2 import (  # type: ignore
                ClobClient, OrderArgs, OrderType, Side,
            )
        except ImportError as e:
            raise RuntimeError(
                "pip install py-clob-client-v2 to enable live trading"
            ) from e
        self._OrderArgs = OrderArgs
        self._OrderType = OrderType
        self._Side = Side
        kwargs = {"host": CLOB_HOST, "chain_id": POLYGON_CHAIN_ID,
                  "key": config.private_key}
        if config.funder_address:
            # only pass funder/signature_type if this client version accepts
            # them — otherwise fail with a clear message, not a TypeError
            params = inspect.signature(ClobClient.__init__).parameters
            accepts_kwargs = any(p.kind == inspect.Parameter.VAR_KEYWORD
                                 for p in params.values())
            if ("funder" in params and "signature_type" in params) or accepts_kwargs:
                kwargs["funder"] = config.funder_address
                kwargs["signature_type"] = config.signature_type
            else:
                raise RuntimeError(
                    "This py-clob-client-v2 version does not accept "
                    "funder/signature_type — proxy-wallet trading is not "
                    "supported with it. Upgrade the package or use a plain "
                    "EOA that holds the USDC (leave POLYMARKET_FUNDER_ADDRESS "
                    "empty).")
        self.client = ClobClient(**kwargs)
        creds = self.client.create_or_derive_api_creds()
        self.client.set_api_creds(creds)
        self.portfolio = portfolio
        self.fees = fees
        self._status_failures: dict[str, int] = {}
        log.info("live executor ready (funder=%s)", config.funder_address or "EOA")

    # --------------------------------------------------------- primitives
    def _post_limit(self, token_id: str, side_str: str, price: float,
                    shares: float, order_type) -> tuple[bool, str]:
        """Post a limit order. Returns (accepted, order_id)."""
        side = self._Side.BUY if side_str == "BUY" else self._Side.SELL
        try:
            resp = self.client.create_and_post_order(
                order_args=self._OrderArgs(
                    token_id=token_id, price=round(price, 3),
                    size=shares, side=side,
                ),
                order_type=order_type,
            )
        except Exception as e:  # network/API errors must not kill the loop
            log.error("order failed: %s %s -> %s", side_str, token_id[:16], e)
            return False, ""
        ok = self._resp_ok(resp)
        if not ok:
            log.warning("order rejected: %s %s -> %s", side_str, token_id[:16], resp)
        return ok, self._resp_order_id(resp)

    @staticmethod
    def _resp_ok(resp) -> bool:
        if resp is None:
            return False
        if not isinstance(resp, dict):
            resp = getattr(resp, "__dict__", {}) or {}
        status = str(resp.get("status", "")).lower()
        if status in ("matched", "live"):
            return True
        if resp.get("success") and status not in ("killed", "unmatched", "canceled"):
            return True
        return False

    @staticmethod
    def _resp_order_id(resp) -> str:
        if resp is None:
            return ""
        if not isinstance(resp, dict):
            resp = getattr(resp, "__dict__", {}) or {}
        return str(resp.get("orderID") or resp.get("orderId") or "")

    def _order_status(self, order_id: str) -> dict | None:
        try:
            info = self.client.get_order(order_id)
        except Exception as e:
            n = self._status_failures.get(order_id, 0) + 1
            self._status_failures[order_id] = n
            lvl = log.error if n >= STATUS_FAIL_LIMIT else log.debug
            lvl("order status fetch failed x%d for %s: %s", n, order_id[:16], e)
            return None
        self._status_failures.pop(order_id, None)
        if info is None:
            return {}
        return info if isinstance(info, dict) else (getattr(info, "__dict__", {}) or {})

    def _reconcile_order(self, order: OpenOrder, info: dict) -> float:
        """Book any newly matched size for a tracked order. Returns shares booked."""
        matched = float(info.get("size_matched") or info.get("sizeMatched") or 0.0)
        original = float(info.get("original_size") or info.get("size") or order.shares)
        remaining_remote = max(0.0, original - matched)
        newly_filled = max(0.0, order.shares - remaining_remote)
        if newly_filled > 1e-9:
            self.portfolio.fill_open_order(order.order_id, newly_filled, fee=0.0)
            log.info("LIVE maker fill: %s %.2f %s @ %.3f", order.side,
                     newly_filled, order.outcome, order.price)
        return newly_filled

    # ------------------------------------------------------------ taker path
    def _send_leg(self, leg: Leg, shares: float, price: float) -> bool:
        """Limit-FOK: fills fully at <= price (BUY) / >= price (SELL) or kills."""
        ok, _ = self._post_limit(leg.token_id, leg.side, price, shares,
                                 self._OrderType.FOK)
        return ok

    def _unwind(self, filled: list[tuple[Leg, float]]) -> None:
        """Sell back filled legs at an aggressive floor — and BOOK the sells:
        leg-risk losses must hit the ledger and the daily loss stop."""
        log.warning("unwinding %d filled leg(s) after bundle failure", len(filled))
        for leg, shares in filled:
            floor = max(0.01, round(leg.fill_price - UNWIND_FLOOR_DROP, 2))
            if self._send_leg(leg, shares, floor):
                self.portfolio.apply_sell(Fill(
                    token_id=leg.token_id, side="SELL", price=floor,
                    shares=shares, fee=self.fees.taker_fee(shares, floor, leg.category),
                    timestamp=now_iso(), strategy="unwind",
                    market_question=leg.market_question, outcome=leg.outcome,
                    condition_id=leg.condition_id))
            else:
                log.error("UNWIND FAILED for %s — position remains open; "
                          "resolve manually on polymarket.com", leg.token_id[:16])

    def execute(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        filled: list[tuple[Leg, float]] = []
        total = 0.0
        for leg in opp.legs:
            shares = _floor2(leg.shares * scale)
            if shares <= 0:
                continue
            if leg.side == "SELL":
                if not self._send_leg(leg, shares, leg.price):
                    return ExecutionResult(False, f"sell failed on {leg.outcome}")
                self.portfolio.apply_sell(Fill(
                    token_id=leg.token_id, side="SELL", price=leg.price,
                    shares=shares,
                    fee=self.fees.taker_fee(shares, leg.price, leg.category),
                    timestamp=now_iso(), strategy=opp.strategy,
                    market_question=leg.market_question, outcome=leg.outcome,
                    condition_id=leg.condition_id))
                continue
            if not self._send_leg(leg, shares, leg.price):
                if filled:
                    self._unwind(filled)
                return ExecutionResult(False, f"leg failed on {leg.outcome}; unwound")
            filled.append((leg, shares))
            # book at the planned average fill price; the limit-FOK can only
            # have filled at that or better. force=True: on-chain fills are facts.
            px = leg.fill_price
            fee = self.fees.taker_fee(shares, px, leg.category)
            self.portfolio.apply_buy(Fill(
                token_id=leg.token_id, side="BUY", price=px, shares=shares,
                fee=fee, timestamp=now_iso(), strategy=opp.strategy,
                market_question=leg.market_question, outcome=leg.outcome,
                condition_id=leg.condition_id), force=True)
            total += px * shares + fee
        log.info("LIVE filled %s for ~$%.2f", opp.kind, total)
        return ExecutionResult(True, "live fill", total)

    # ------------------------------------------------------------ maker path
    def place_maker(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        # pre-check affordability of the WHOLE quote so we never post a leg
        # we cannot reserve locally
        legs = [(leg, _floor2(leg.shares * scale)) for leg in opp.legs]
        legs = [(l, s) for l, s in legs if s > 0]
        need = sum(l.price * s for l, s in legs if l.side == "BUY")
        if need > self.portfolio.cash + 1e-9:
            return ExecutionResult(False, "quote exceeds free cash; skipped")

        placed: list[str] = []
        reserved = 0.0
        for leg, shares in legs:
            ok, order_id = self._post_limit(leg.token_id, leg.side, leg.price,
                                            shares, self._OrderType.GTC)
            if not ok or not order_id:
                for oid in placed:
                    self.cancel_order(oid)
                return ExecutionResult(False, "maker placement failed; rolled back")
            try:
                self.portfolio.add_open_order(OpenOrder(
                    order_id=order_id, token_id=leg.token_id, side=leg.side,
                    price=leg.price, shares=shares, strategy=opp.strategy,
                    market_question=leg.market_question, outcome=leg.outcome,
                    category=leg.category, condition_id=leg.condition_id,
                    placed_at=now_iso(), quote_key=opp.key,
                ))
            except ValueError as e:
                # local reservation failed AFTER the remote post: cancel the
                # just-posted order too, or it rests untracked forever
                log.error("reservation failed after post (%s) — canceling", e)
                try:
                    self.client.cancel(order_id)
                except Exception as ce:
                    log.error("cleanup cancel failed for %s: %s — cancel it "
                              "manually on polymarket.com", order_id[:16], ce)
                for oid in placed:
                    self.cancel_order(oid)
                return ExecutionResult(False, "reservation failed; rolled back")
            placed.append(order_id)
            reserved += leg.price * shares
        log.info("LIVE quoted %s ($%.2f reserved)", opp.description[:70], reserved)
        return ExecutionResult(True, "maker quote placed", reserved)

    def cancel_order(self, order_id: str) -> bool:
        """Reconcile-then-cancel. The reservation is released ONLY once the
        exchange confirms the order is gone; matched size found on the way is
        booked first so partial fills are never lost."""
        order = next((o for o in self.portfolio.open_orders()
                      if o.order_id == order_id), None)
        if order is None:
            try:
                self.client.cancel(order_id)
            except Exception:
                pass
            return True

        # 1) book anything that matched before we cancel
        info = self._order_status(order_id)
        if info is None:
            log.warning("cannot reach order %s — keeping it tracked; will "
                        "retry next cycle", order_id[:16])
            return False
        if info:
            self._reconcile_order(order, info)
            order = next((o for o in self.portfolio.open_orders()
                          if o.order_id == order_id), None)
            if order is None:  # fully filled during reconcile
                return True

        # 2) cancel the remainder on the exchange
        try:
            self.client.cancel(order_id)
        except Exception as e:
            msg = str(e).lower()
            if "not found" in msg or "404" in msg:
                # gone remotely with nothing left matched -> safe to release
                self.portfolio.cancel_open_order(order_id)
                return True
            log.warning("cancel failed for %s: %s — keeping it tracked",
                        order_id[:16], e)
            return False

        # 3) final reconcile catches fills that raced the cancel
        info = self._order_status(order_id)
        if info:
            self._reconcile_order(order, info)
        if any(o.order_id == order_id for o in self.portfolio.open_orders()):
            self.portfolio.cancel_open_order(order_id)
        return True

    def sync_orders(self, books: dict[str, OrderBook]) -> int:
        """Poll resting orders' status; book matched size as maker fills."""
        fills = 0
        for order in self.portfolio.open_orders():
            info = self._order_status(order.order_id)
            if not info:
                continue
            if self._reconcile_order(order, info) > 1e-9:
                fills += 1
                continue
            status = str(info.get("status", "")).lower()
            if status in ("canceled", "cancelled", "expired"):
                self.portfolio.cancel_open_order(order.order_id)
        return fills
