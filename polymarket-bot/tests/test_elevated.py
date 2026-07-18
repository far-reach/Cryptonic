"""Tests for the elevated engine: depth sizing, market making, resting
orders, settlement, stops, and pair merging."""

import json

import pytest
from conftest import gamma_market_raw, make_book, make_market

from polybot.bot import Bot
from polybot.executor.paper import PaperExecutor
from polybot.fees import FeeModel
from polybot.models import BookLevel, Market, OpenOrder, Opportunity, Leg, OrderBook
from polybot.portfolio import Portfolio
from polybot.risk import RiskManager
from polybot.scanner import Scanner, ScanResult
from polybot.settlement import SettlementChecker, _resolved_outcome
from polybot.strategies.depth import size_basket
from polybot.strategies.market_maker import MarketMaker, clamp_to_tick


# ------------------------------------------------------------------- depth
def _book(levels):
    return OrderBook(token_id="t", bids=[BookLevel(0.01, 1)],
                     asks=[BookLevel(p, s) for p, s in levels])


def test_depth_sizing_extends_past_best_level():
    no_fee = lambda p: 0.0
    yes = _book([(0.45, 100), (0.46, 200)])
    no = _book([(0.50, 300)])
    sized = size_basket([yes, no], 1.0, no_fee, min_edge=0.01)
    assert sized is not None
    shares, avg_prices, limit_prices, cost = sized
    # second YES level still clears: 0.46 + 0.50 = 0.96 -> takes all 300
    assert shares == pytest.approx(300)
    assert limit_prices == [0.46, 0.50]
    # avg YES price blends 100@0.45 + 200@0.46
    assert avg_prices[0] == pytest.approx((100 * 0.45 + 200 * 0.46) / 300)


def test_depth_sizing_stops_when_marginal_edge_dies():
    no_fee = lambda p: 0.0
    yes = _book([(0.45, 100), (0.53, 500)])   # second level kills the arb
    no = _book([(0.50, 300)])
    sized = size_basket([yes, no], 1.0, no_fee, min_edge=0.01)
    shares, _, limit_prices, _ = sized
    assert shares == pytest.approx(100)       # stops at the first level
    assert limit_prices == [0.45, 0.50]


def test_depth_sizing_none_when_first_unit_fails():
    no_fee = lambda p: 0.0
    yes = _book([(0.55, 100)])
    no = _book([(0.50, 100)])
    assert size_basket([yes, no], 1.0, no_fee, min_edge=0.01) is None


def test_depth_sizing_respects_fees():
    fee = FeeModel()
    yes = _book([(0.49, 100)])
    no = _book([(0.50, 100)])
    # 0.99 pair -> 1% gross, but sports fees ~2.5% of a 0.5 share kill it
    assert size_basket([yes, no], 1.0,
                       lambda p: fee.taker_fee(1, p, "sports"), 0.005) is None


# ------------------------------------------------------------ market maker
def _mm_market(**kw):
    from datetime import datetime, timedelta, timezone
    end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    kw.setdefault("volume_24h", 50_000)
    kw.setdefault("end_date", end)
    return make_market(**kw)


def test_maker_quotes_wide_spread_market(config, fees):
    m = _mm_market()
    books = {"tok_yes": make_book("tok_yes", 0.46, 0.54)}  # 8c spread
    opps = MarketMaker(config, fees).find([m], books, [])
    assert len(opps) == 1
    opp = opps[0]
    assert opp.execution == "maker"
    b_y = opp.legs[0].price
    b_n = opp.legs[1].price
    assert b_y == pytest.approx(0.46)
    assert b_n == pytest.approx(1 - 0.54)
    assert b_y + b_n <= 1 - config.strategies.maker_min_capture + 1e-9


def test_maker_skips_tight_spread(config, fees):
    m = _mm_market()
    books = {"tok_yes": make_book("tok_yes", 0.49, 0.51)}
    assert MarketMaker(config, fees).find([m], books, []) == []


def test_maker_skips_tails_and_near_resolution(config, fees):
    books_tail = {"tok_yes": make_book("tok_yes", 0.05, 0.12)}
    assert MarketMaker(config, fees).find([_mm_market()], books_tail, []) == []
    from datetime import datetime, timedelta, timezone
    soon = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
    m = make_market(volume_24h=50_000, end_date=soon)
    books = {"tok_yes": make_book("tok_yes", 0.46, 0.54)}
    assert MarketMaker(config, fees).find([m], books, []) == []


def test_maker_caps_concurrent_markets(config, fees):
    ms, books = [], {}
    for i in range(6):
        m = _mm_market(condition_id=f"0xc{i}", yes_token=f"y{i}", no_token=f"n{i}",
                       volume_24h=10_000 + i * 1000)
        ms.append(m)
        books[f"y{i}"] = make_book(f"y{i}", 0.46, 0.54)
    opps = MarketMaker(config, fees).find(ms, books, [])
    assert len(opps) == config.strategies.maker_max_markets
    # busiest markets picked first
    assert opps[0].legs[0].token_id == "y5"


def test_clamp_to_tick():
    assert clamp_to_tick(0.4567, 0.01) == pytest.approx(0.45)
    assert clamp_to_tick(0.001, 0.01) == pytest.approx(0.01)
    assert clamp_to_tick(0.999, 0.01) == pytest.approx(0.99)


def _dummy_scanner():
    from types import SimpleNamespace
    return SimpleNamespace(gamma=None)


# ------------------------------------------------- portfolio resting orders
def _order(order_id="o1", side="BUY", price=0.46, shares=10.0, **kw):
    defaults = dict(order_id=order_id, token_id="tokA", side=side, price=price,
                    shares=shares, strategy="market_maker",
                    market_question="Q?", outcome="Yes", condition_id="0xc1",
                    quote_key="maker:0xc1")
    defaults.update(kw)
    return OpenOrder(**defaults)


def test_open_order_reserves_and_releases_cash():
    p = Portfolio(100.0)
    p.add_open_order(_order(price=0.5, shares=10))
    assert p.cash == pytest.approx(95.0)
    assert p.reserved == pytest.approx(5.0)
    assert p.deployed() == pytest.approx(5.0)
    p.cancel_open_order("o1")
    assert p.cash == pytest.approx(100.0)
    assert p.reserved == pytest.approx(0.0)


def test_open_order_fill_converts_to_position():
    p = Portfolio(100.0)
    p.add_open_order(_order(price=0.5, shares=10))
    p.fill_open_order("o1", 10, fee=0.0)
    assert p.reserved == pytest.approx(0.0)
    assert p.cash == pytest.approx(95.0)
    pos = p.positions()[0]
    assert pos.shares == 10 and pos.avg_price == pytest.approx(0.5)
    assert pos.condition_id == "0xc1"
    assert p.state["open_orders"] == {}


def test_open_order_partial_fill():
    p = Portfolio(100.0)
    p.add_open_order(_order(price=0.5, shares=10))
    p.fill_open_order("o1", 4)
    assert p.positions()[0].shares == pytest.approx(4)
    assert p.open_orders()[0].shares == pytest.approx(6)
    assert p.reserved == pytest.approx(3.0)


def test_open_order_over_cash_rejected():
    p = Portfolio(4.0)
    with pytest.raises(ValueError):
        p.add_open_order(_order(price=0.5, shares=10))


def test_market_exposure_includes_open_orders():
    p = Portfolio(100.0)
    p.add_open_order(_order(price=0.5, shares=10))
    assert p.market_exposure("0xc1") == pytest.approx(5.0)


# ------------------------------------------------------- paper maker cycle
def _maker_opp():
    return Opportunity(
        strategy="market_maker", kind="maker_quote", description="quote",
        legs=[Leg("tok_yes", "BUY", 0.46, 10, "Q?", "Yes", "sports", "0xc1"),
              Leg("tok_no", "BUY", 0.46, 10, "Q?", "No", "sports", "0xc1")],
        edge=0.08, expected_profit=0.8, total_cost=9.2, guaranteed=False,
        key="maker:0xc1", execution="maker",
    )


def test_paper_maker_place_and_fill_pair(config):
    p = Portfolio(100.0)
    ex = PaperExecutor(p, FeeModel())
    assert ex.place_maker(_maker_opp()).success
    assert len(p.open_orders()) == 2
    assert p.reserved == pytest.approx(9.2)
    # market trades through both bids -> both fill fee-free
    books = {"tok_yes": make_book("tok_yes", 0.44, 0.45),
             "tok_no": make_book("tok_no", 0.44, 0.45)}
    fills = ex.sync_orders(books)
    assert fills == 2
    assert p.open_position_count() == 2
    assert p.reserved == pytest.approx(0.0)


def test_paper_maker_no_fill_when_ask_above_bid(config):
    p = Portfolio(100.0)
    ex = PaperExecutor(p, FeeModel())
    ex.place_maker(_maker_opp())
    books = {"tok_yes": make_book("tok_yes", 0.47, 0.49),
             "tok_no": make_book("tok_no", 0.47, 0.49)}
    assert ex.sync_orders(books) == 0
    assert len(p.open_orders()) == 2


def test_merge_maker_pairs_realizes_profit(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    bot = Bot(config, scanner=_dummy_scanner())  # scanner unused here
    p = bot.portfolio
    ex = PaperExecutor(p, FeeModel())
    ex.place_maker(_maker_opp())
    books = {"tok_yes": make_book("tok_yes", 0.44, 0.45),
             "tok_no": make_book("tok_no", 0.44, 0.45)}
    ex.sync_orders(books)
    cash_before = p.cash
    merged = bot._merge_maker_pairs()
    assert merged == pytest.approx(10 * (1 - 0.92))
    assert p.open_position_count() == 0
    assert p.cash == pytest.approx(cash_before + 10.0)  # $1 per pair
    assert p.state["realized_pnl"] == pytest.approx(0.8)


def test_inventory_stop_dumps_runaway_side(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    bot = Bot(config, scanner=_dummy_scanner())
    p = bot.portfolio
    ex = bot.executor
    ex.place_maker(_maker_opp())
    # only YES fills; then price collapses 10c below our cost
    books = {"tok_yes": make_book("tok_yes", 0.44, 0.45)}
    ex.sync_orders(books)
    assert p.open_position_count() == 1
    crash = {"tok_yes": make_book("tok_yes", 0.36, 0.38)}
    exits = bot._inventory_stops(crash)
    assert exits == 1
    assert p.open_position_count() == 0
    assert p.state["realized_pnl"] < 0  # loss realized, position gone


def test_value_stop_loss_exits(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    bot = Bot(config, scanner=_dummy_scanner())
    p = bot.portfolio
    from polybot.models import Fill
    from polybot.portfolio import now_iso
    p.apply_buy(Fill("tokV", "BUY", 0.95, 10, 0.0, now_iso(),
                     "value_favorites", "Q?", "Yes", "0xv1"))
    books = {"tokV": make_book("tokV", 0.70, 0.75)}
    assert bot._value_stops(books) == 1
    assert p.open_position_count() == 0


# -------------------------------------------------------------- settlement
def test_resolved_outcome_parsing():
    assert _resolved_outcome({"closed": True, "outcomePrices": '["1", "0"]'}) == 0
    assert _resolved_outcome({"closed": True, "outcomePrices": '["0", "1"]'}) == 1
    assert _resolved_outcome({"closed": False, "outcomePrices": '["1", "0"]'}) is None
    assert _resolved_outcome({"closed": True, "outcomePrices": '["0.5", "0.5"]'}) is None
    assert _resolved_outcome({"closed": True, "outcomePrices": "garbage"}) is None


class FakeGammaSettle:
    def __init__(self, markets):
        self._markets = markets

    def markets_by_condition(self, ids):
        return [m for m in self._markets if m["conditionId"] in ids]


def test_settlement_credits_winner_and_zeroes_loser(config):
    p = Portfolio(100.0)
    from polybot.models import Fill
    from polybot.portfolio import now_iso
    p.apply_buy(Fill("111", "BUY", 0.9, 10, 0.0, now_iso(),
                     "value_favorites", "Q?", "Yes", "0xabc"))
    p.apply_buy(Fill("222", "BUY", 0.05, 10, 0.0, now_iso(),
                     "value_favorites", "Q?", "No", "0xabc"))
    gamma = FakeGammaSettle([gamma_market_raw(
        condition_id="0xabc", closed=True,
        outcomePrices=json.dumps(["1", "0"]))])
    pnl = SettlementChecker(gamma, p).run()
    # YES won: +$1.00/share (cost .9) = +1.0 ; NO lost: -0.5
    assert pnl == pytest.approx(10 * 0.1 - 10 * 0.05)
    assert p.open_position_count() == 0
    assert p.cash == pytest.approx(100 - 9 - 0.5 + 10)


def test_settlement_leaves_unresolved_alone(config):
    p = Portfolio(100.0)
    from polybot.models import Fill
    from polybot.portfolio import now_iso
    p.apply_buy(Fill("111", "BUY", 0.9, 10, 0.0, now_iso(),
                     "value_favorites", "Q?", "Yes", "0xabc"))
    gamma = FakeGammaSettle([gamma_market_raw(
        condition_id="0xabc", closed=True,
        outcomePrices=json.dumps(["0.5", "0.5"]))])
    assert SettlementChecker(gamma, p).run() == 0.0
    assert p.open_position_count() == 1


# --------------------------------------------------------------- risk bits
def test_maker_opportunities_bypass_dedupe(config):
    p = Portfolio(100.0)
    rm = RiskManager(config, p)
    opp = _maker_opp()
    assert rm.check(opp).approved
    rm.mark_taken(opp)                    # no-op for maker
    assert rm.check(opp).approved         # requote allowed


def test_sell_only_opportunities_always_pass(config):
    p = Portfolio(100.0)
    p.state["cash"] = 0.0                 # broke — but sells must still pass
    from polybot.models import Fill
    from polybot.portfolio import now_iso
    p.state["cash"] = 5.0
    p.apply_buy(Fill("t", "BUY", 0.5, 10, 0.0, now_iso(), "s", "Q?", "Yes"))
    rm = RiskManager(config, p)
    sell = Opportunity(strategy="s", kind="stop", description="exit",
                       legs=[Leg("t", "SELL", 0.4, 10, "Q?", "Yes")],
                       edge=0, expected_profit=0, total_cost=0, key="x")
    assert rm.check(sell).approved


# ------------------------------------------------------- full maker cycle
class FakeGamma2:
    def __init__(self, markets_raw, events):
        self._markets = markets_raw
        self._events = events

    def active_markets(self, pages=1, page_size=100, min_volume_24h=0.0):
        return [m for m in (Market.from_gamma(r) for r in self._markets) if m]

    def negrisk_events(self, pages=2, page_size=50):
        return self._events

    def markets_by_condition(self, ids):
        return [r for r in self._markets if r.get("conditionId") in ids]


class FakeClob2:
    def __init__(self, books):
        self._books = books

    def books(self, token_ids):
        return {t: self._books[t] for t in token_ids if t in self._books}


def test_full_cycle_places_maker_quotes_and_requotes(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    from datetime import datetime, timedelta, timezone
    end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    raw = gamma_market_raw(question="Busy market?", condition_id="0xmm",
                           yes="my", no="mn", bestBid=0.46, bestAsk=0.54,
                           volume24hr=60_000, endDate=end)
    books = {"my": make_book("my", 0.46, 0.54), "mn": make_book("mn", 0.44, 0.56)}
    scanner = Scanner(config, gamma=FakeGamma2([raw], []), clob=FakeClob2(books))
    bot = Bot(config, scanner=scanner)

    n = bot.run_once()
    assert n == 1                                  # one quote pair placed
    assert len(bot.portfolio.open_orders()) == 2
    assert bot.portfolio.reserved > 0

    # same books next cycle: quote unchanged, no duplicate placement
    assert bot.run_once() == 0
    assert len(bot.portfolio.open_orders()) == 2

    # big drift: requote (cancel + place)
    books["my"] = make_book("my", 0.40, 0.48)
    assert bot.run_once() == 1
    orders = bot.portfolio.open_orders()
    assert len(orders) == 2
    assert any(abs(o.price - 0.40) < 1e-9 for o in orders)

    # shutdown cancels everything and frees cash
    bot.shutdown()
    assert bot.portfolio.open_orders() == []
    assert bot.portfolio.reserved == pytest.approx(0.0)
    assert bot.portfolio.cash == pytest.approx(100.0)
