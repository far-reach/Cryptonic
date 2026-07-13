"""Live executor: real orders on the Polymarket CLOB (V2).

Requires:
  pip install py-clob-client-v2
  POLYMARKET_PRIVATE_KEY      — wallet key (0x…), NEVER commit this
  POLYMARKET_FUNDER_ADDRESS   — proxy wallet holding USDC (Polymarket profile
                                address); leave empty for a plain EOA
  POLYMARKET_SIGNATURE_TYPE   — 0=EOA, 1=email/Magic login, 2=browser wallet
  POLYBOT_LIVE_ACK=I_UNDERSTAND_THE_RISKS  — explicit opt-in gate

Multi-leg execution model: legs are sent sequentially as Fill-Or-Kill
marketable limit orders at the scanned price. FOK means a leg either fills
completely at (or better than) our price or not at all — no partial-fill
states. If a later leg fails after earlier legs filled, the bundle is no
longer an arb; the executor immediately tries to unwind the filled legs at
market and reports the incident. This "leg risk" is the main real-world cost
of CLOB arbitrage; the small sizes this bot trades keep it manageable, but
it is never zero.
"""

from __future__ import annotations

import logging
import os

from ..config import CLOB_HOST, POLYGON_CHAIN_ID, Config
from ..models import Fill, Leg, Opportunity
from ..portfolio import Portfolio, now_iso
from ..fees import FeeModel
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
                ClobClient, MarketOrderArgs, OrderType, Side,
            )
        except ImportError as e:
            raise RuntimeError(
                "pip install py-clob-client-v2 to enable live trading"
            ) from e
        self._MarketOrderArgs = MarketOrderArgs
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

    def _send_leg(self, leg: Leg, shares: float) -> bool:
        """FOK buy of `shares` at up to leg.price. True if fully filled."""
        side = self._Side.BUY if leg.side == "BUY" else self._Side.SELL
        amount = round(shares * leg.price, 2) if leg.side == "BUY" else round(shares, 2)
        try:
            resp = self.client.create_and_post_market_order(
                order_args=self._MarketOrderArgs(
                    token_id=leg.token_id, amount=amount, side=side,
                    price=leg.price,
                ),
                order_type=self._OrderType.FOK,
            )
            ok = bool(resp and (resp.get("success") or resp.get("orderID")
                                or resp.get("status") in ("matched", "live")))
            if not ok:
                log.warning("leg rejected: %s -> %s", leg.token_id[:16], resp)
            return ok
        except Exception as e:  # network/API errors must not kill the loop
            log.error("leg failed: %s -> %s", leg.token_id[:16], e)
            return False

    def _unwind(self, filled: list[tuple[Leg, float]]) -> None:
        log.warning("unwinding %d filled leg(s) after bundle failure", len(filled))
        for leg, shares in filled:
            sell = Leg(leg.token_id, "SELL", 0.0, shares,
                       leg.market_question, leg.outcome, leg.category)
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
                        outcome=leg.outcome)
            if leg.side == "BUY":
                self.portfolio.apply_buy(fill)
                total += leg.price * shares + fee
            else:
                self.portfolio.apply_sell(fill)
        log.info("LIVE filled %s for ~$%.2f", opp.kind, total)
        return ExecutionResult(True, "live fill", total)
