import pytest
from conftest import make_book, make_market

from polybot.executor.paper import PaperExecutor
from polybot.fees import FeeModel
from polybot.models import Fill, Leg, Opportunity
from polybot.portfolio import Portfolio, now_iso
from polybot.risk import RiskManager


def _opp(cost=5.0, edge=0.02, guaranteed=True, key="k1", question="Q?"):
    shares = cost / 0.5
    return Opportunity(
        strategy="test", kind="test_arb", description="test",
        legs=[Leg("tokA", "BUY", 0.5, shares, question, "Yes")],
        edge=edge, expected_profit=cost * edge, total_cost=cost,
        guaranteed=guaranteed, key=key,
    )


def _fill(token="tokA", side="BUY", price=0.5, shares=10.0, fee=0.05, q="Q?"):
    return Fill(token_id=token, side=side, price=price, shares=shares,
                fee=fee, timestamp=now_iso(), strategy="test",
                market_question=q, outcome="Yes")


# ---------------------------------------------------------------- portfolio
def test_buy_then_settle_at_dollar():
    p = Portfolio(100.0)
    p.apply_buy(_fill(price=0.9, shares=10, fee=0.09))
    assert p.cash == pytest.approx(100 - 9.09)
    pnl = p.apply_sell(_fill(side="SELL", price=1.0, shares=10, fee=0.0))
    assert pnl == pytest.approx(10 - 9.09)
    assert p.cash == pytest.approx(100 + 10 - 9.09)
    assert p.open_position_count() == 0


def test_buy_beyond_cash_raises():
    p = Portfolio(5.0)
    with pytest.raises(ValueError):
        p.apply_buy(_fill(price=0.9, shares=10, fee=0.0))


def test_sell_more_than_held_raises():
    p = Portfolio(100.0)
    p.apply_buy(_fill(shares=5))
    with pytest.raises(ValueError):
        p.apply_sell(_fill(side="SELL", shares=6))


def test_avg_price_includes_fee():
    p = Portfolio(100.0)
    p.apply_buy(_fill(price=0.5, shares=10, fee=0.10))
    pos = p.positions()[0]
    assert pos.avg_price == pytest.approx(0.51)


# --------------------------------------------------------------------- risk
def test_risk_approves_and_dedupes(config):
    p = Portfolio(100.0)
    rm = RiskManager(config, p)
    opp = _opp()
    d = rm.check(opp)
    assert d.approved and d.scale == 1.0
    rm.mark_taken(opp)
    assert not rm.check(opp).approved  # same key rejected


def test_risk_scales_oversized_trade(config):
    p = Portfolio(100.0)
    rm = RiskManager(config, p)
    opp = _opp(cost=40.0, key="big")  # above max_trade_usdc=10
    d = rm.check(opp)
    assert d.approved
    assert d.scale == pytest.approx(10.0 / 40.0)


def test_risk_respects_market_cap(config):
    p = Portfolio(100.0)
    # already $12 deployed in this market; cap is $15
    p.apply_buy(_fill(price=0.6, shares=20, fee=0.0, q="Same market?"))
    rm = RiskManager(config, p)
    d = rm.check(_opp(cost=10.0, key="m2", question="Same market?"))
    assert d.approved
    assert d.scale == pytest.approx(3.0 / 10.0)  # only $3 headroom left


def test_risk_halts_on_drawdown(config):
    p = Portfolio(100.0)
    p.state["cash"] = 70.0  # equity below 75 floor, nothing deployed
    rm = RiskManager(config, p)
    assert rm.halted() is not None
    assert not rm.check(_opp(key="x")).approved


def test_risk_deployed_cap(config):
    p = Portfolio(100.0)
    p.apply_buy(_fill(price=0.8, shares=100, fee=0.0))  # $80 deployed = cap
    rm = RiskManager(config, p)
    assert not rm.check(_opp(key="y")).approved


def test_risk_value_position_limit(config):
    config.risk.max_value_positions = 1
    p = Portfolio(100.0)
    p.apply_buy(_fill(token="v1", price=0.5, shares=2, fee=0.0))
    rm = RiskManager(config, p)
    d = rm.check(_opp(cost=2.0, guaranteed=False, key="v2", question="Other?"))
    assert not d.approved
    # guaranteed arbs are exempt from the value-position limit
    d2 = rm.check(_opp(cost=2.0, guaranteed=True, key="a1", question="Other?"))
    assert d2.approved


# ----------------------------------------------------------- paper executor
def test_paper_executor_round_trip(config):
    p = Portfolio(100.0)
    fees = FeeModel()
    ex = PaperExecutor(p, fees)
    opp = Opportunity(
        strategy="complement_arb", kind="complement_arb", description="t",
        legs=[Leg("y", "BUY", 0.47, 100, "Q?", "Yes"),
              Leg("n", "BUY", 0.50, 100, "Q?", "No")],
        edge=0.03, expected_profit=3.0, total_cost=97.0, guaranteed=True, key="pp",
    )
    res = ex.execute(opp, scale=0.1)  # 10 pairs
    assert res.success
    assert p.open_position_count() == 2
    # cash reduced by ~ 10*(0.97) + fees
    assert p.cash < 100 - 9.6
    # settle: YES wins -> sell YES at 1.0, NO at 0.0
    p.apply_sell(Fill("y", "SELL", 1.0, 10, 0.0, now_iso(), "t", "Q?", "Yes"))
    p.apply_sell(Fill("n", "SELL", 0.0, 10, 0.0, now_iso(), "t", "Q?", "No"))
    assert p.cash > 100  # locked-in arb profit survives settlement
