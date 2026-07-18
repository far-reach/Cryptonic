"""Live executor: real orders on the Polymarket CLOB (V2).

Requires:
  pip install py-clob-client-v2
  POLYMARKET_PRIVATE_KEY      — wallet key (0x…), NEVER commit this
  POLYMARKET_FUNDER_ADDRESS   — proxy wallet holding USDC (Polymarket profile
                                address); leave empty for a plain EOA
  POLYMARKET_SIGNATURE_TYPE   — 0=EOA, 1=email/Magic login, 2=browser wallet
  POLYBOT_LIVE_ACK=I_UNDERSTAND_THE_RISKS  — explicit opt-in gate

Taker legs are Fill-Or-Kill marketable orders at the scanned price: a leg
either fills completely at (or better than) our price or not at all. If a
later leg of a bundle fails after earlier legs filled, the executor unwinds
the filled legs at market ("leg risk" — the main real-world cost of CLOB
arbitrage; small sizes keep it cheap, never zero).

Maker legs are GTC limit orders tracked in the portfolio; sync_orders polls
each order's status and books partial/complete maker fills (fee-free).
"""

from __future__ import annotations

import logging
import os

from ..config import CLOB_HOST, POLYGON_CHAIN_ID, Config
from ..fees import FeeModel
from ..models import Fill, Leg, OpenOrder, Opportunity, OrderBook
from ..portfolio import Portfolio, now_iso
from .base import ExecutionResult, Executor

log = logging.getLogger(__name__)

ACK_ENV = "POLYBOT_LIVE_ACK"
ACK_VALUE = "I_UNDERSTAND_THE_RISKS"


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
                ClobClient, MarketOrderArgs, OrderArgs, OrderType, Side,
            )
        except ImportError as e:
            raise RuntimeError(
                "pip install py-clob-client-v2 to enable live trading"
            ) from e
        self._MarketOrderArgs = MarketOrderArgs
        self._OrderArgs = OrderArgs
        self._OrderType = OrderType
        self._Side = Side
        kwargs = {"host": CLOB_HOST, "chain_id": POLYGON_CHAIN_ID,
                  "key": config.private_key}
        if config.funder_address:
            kwargs["funder"] = config.funder_address
            kwargs["signature_type"] = config.signature_type
        self.client = ClobClient(**kwargs)
        creds = self.client.create_or_derive_api_creds()
        self.client.set_api_creds(creds)
        self.portfolio = portfolio
        self.fees = fees
        log.info("live executor ready (funder=%s)", config.funder_address or "EOA")

    # ------------------------------------------------------------ taker path
    def _send_leg(self, leg: Leg, shares: float) -> bool:
        """FOK order for `shares` at up to leg.price. True if fully filled."""
        side = self._Side.BUY if leg.side == "BUY" else self._Side.SELL
        # BUY market orders are denominated in USDC, SELL in shares
        amount = round(shares * leg.price, 2) if leg.side == "BUY" else round(shares, 2)
        if amount <= 0:
            return False
        try:
            resp = self.client.create_and_post_market_order(
                order_args=self._MarketOrderArgs(
                    token_id=leg.token_id, amount=amount, side=side,
                ),
                order_type=self._OrderType.FOK,
            )
            ok = self._resp_ok(resp)
            if not ok:
                log.warning("leg rejected: %s -> %s", leg.token_id[:16], resp)
            return ok
        except Exception as e:  # network/API errors must not kill the loop
            log.error("leg failed: %s -> %s", leg.token_id[:16], e)
            return False

    @staticmethod
    def _resp_ok(resp) -> bool:
        if resp is None:
            return False
        if isinstance(resp, dict):
            return bool(resp.get("success") or resp.get("orderID")
                        or resp.get("status") in ("matched", "live"))
        return bool(getattr(resp, "orderID", None) or getattr(resp, "success", False))

    @staticmethod
    def _resp_order_id(resp) -> str:
        if isinstance(resp, dict):
            return str(resp.get("orderID") or resp.get("orderId") or "")
        return str(getattr(resp, "orderID", "") or "")

    def _unwind(self, filled: list[tuple[Leg, float]]) -> None:
        log.warning("unwinding %d filled leg(s) after bundle failure", len(filled))
        for leg, shares in filled:
            sell = Leg(leg.token_id, "SELL", 0.0, shares,
                       leg.market_question, leg.outcome, leg.category,
                       leg.condition_id)
            if not self._send_leg(sell, shares):
                log.error("UNWIND FAILED for %s — position remains open; "
                          "resolve manually on polymarket.com", leg.token_id[:16])

    def execute(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        filled: list[tuple[Leg, float]] = []
        total = 0.0
        for leg in opp.legs:
            shares = round(leg.shares * scale, 2)
            if shares <= 0:
                continue
            if not self._send_leg(leg, shares):
                if filled:
                    self._unwind(filled)
                return ExecutionResult(False, f"leg failed on {leg.outcome}; unwound")
            filled.append((leg, shares))
            fee = self.fees.taker_fee(shares, leg.price, leg.category)
            fill = Fill(token_id=leg.token_id, side=leg.side, price=leg.price,
                        shares=shares, fee=fee, timestamp=now_iso(),
                        strategy=opp.strategy, market_question=leg.market_question,
                        outcome=leg.outcome, condition_id=leg.condition_id)
            if leg.side == "BUY":
                self.portfolio.apply_buy(fill)
                total += leg.price * shares + fee
            else:
                self.portfolio.apply_sell(fill)
        log.info("LIVE filled %s for ~$%.2f", opp.kind, total)
        return ExecutionResult(True, "live fill", total)

    # ------------------------------------------------------------ maker path
    def place_maker(self, opp: Opportunity, scale: float = 1.0) -> ExecutionResult:
        placed_ids: list[str] = []
        reserved = 0.0
        for leg in opp.legs:
            shares = round(leg.shares * scale, 2)
            if shares <= 0:
                continue
            try:
                resp = self.client.create_and_post_order(
                    order_args=self._OrderArgs(
                        token_id=leg.token_id, price=leg.price,
                        size=shares,
                        side=self._Side.BUY if leg.side == "BUY" else self._Side.SELL,
                    ),
                    order_type=self._OrderType.GTC,
                )
            except Exception as e:
                log.error("maker order failed: %s -> %s", leg.token_id[:16], e)
                resp = None
            order_id = self._resp_order_id(resp) if self._resp_ok(resp) else ""
            if not order_id:
                # roll back the other side so we never rest one-legged quotes
                for oid in placed_ids:
                    self.cancel_order(oid)
                return ExecutionResult(False, "maker placement failed; rolled back")
            self.portfolio.add_open_order(OpenOrder(
                order_id=order_id, token_id=leg.token_id, side=leg.side,
                price=leg.price, shares=shares, strategy=opp.strategy,
                market_question=leg.market_question, outcome=leg.outcome,
                category=leg.category, condition_id=leg.condition_id,
                placed_at=now_iso(), quote_key=opp.key,
            ))
            placed_ids.append(order_id)
            reserved += leg.price * shares
        log.info("LIVE quoted %s ($%.2f reserved)", opp.description[:70], reserved)
        return ExecutionResult(True, "maker quote placed", reserved)

    def cancel_order(self, order_id: str) -> bool:
        try:
            self.client.cancel(order_id)
            ok = True
        except Exception as e:
            log.warning("cancel failed for %s: %s (assuming filled/gone)",
                        order_id[:16], e)
            ok = False
        # release the local reservation either way; sync will re-book real fills
        self.portfolio.cancel_open_order(order_id)
        return ok

    def sync_orders(self, books: dict[str, OrderBook]) -> int:
        """Poll resting orders' status; book any matched size as maker fills."""
        fills = 0
        for order in self.portfolio.open_orders():
            try:
                info = self.client.get_order(order.order_id)
            except Exception as e:
                log.debug("order status fetch failed %s: %s", order.order_id[:16], e)
                continue
            if not info:
                continue
            if not isinstance(info, dict):
                info = getattr(info, "__dict__", {}) or {}
            status = str(info.get("status", "")).lower()
            matched = float(info.get("size_matched") or info.get("sizeMatched") or 0.0)
            already = order.shares  # remaining locally
            original = float(info.get("original_size") or info.get("size") or already)
            remaining_remote = max(0.0, original - matched)
            newly_filled = max(0.0, already - remaining_remote)
            if newly_filled > 1e-9:
                self.portfolio.fill_open_order(order.order_id, newly_filled, fee=0.0)
                log.info("LIVE maker fill: %s %.1f %s @ %.3f", order.side,
                         newly_filled, order.outcome, order.price)
                fills += 1
            elif status in ("canceled", "cancelled", "expired"):
                self.portfolio.cancel_open_order(order.order_id)
        return fills
