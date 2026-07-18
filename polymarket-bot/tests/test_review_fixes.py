"""Regression tests for the adversarial-review findings."""

import json

import pytest
from conftest import gamma_market_raw, make_book, make_market

from polybot.bot import Bot
from polybot.executor.paper import PaperExecutor
from polybot.fees import FeeModel
from polybot.models import BookLevel, Fill, Leg, Opportunity, OrderBook
from polybot.portfolio import Portfolio, now_iso
from polybot.risk import RiskManager
from polybot.strategies.depth import size_basket
from polybot.strategies.negrisk_arb import NegRiskArb


def _dummy_scanner():
    from types import SimpleNamespace
    return SimpleNamespace(gamma=None)


# --- finding: YES basket must require the FULL listed outcome set ---------
def test_negrisk_yes_basket_requires_exhaustive_outcomes(config, fees):
    markets = [gamma_market_raw(question=f"C{i}?", condition_id=f"0xc{i}",
                                yes=f"y{i}", no=f"n{i}", negRisk=True)
               for i in range(3)]
    markets[2]["active"] = False  # the favorite is paused
    event = {"slug": "who", "title": "Who?", "negRisk": True,
             "negRiskAugmented": False, "markets": markets,
             "category": "Politics", "endDate": "2026-08-01T00:00:00Z"}
    books = {}
    for i in range(3):
        books[f"y{i}"] = make_book(f"y{i}", 0.18, 0.20)   # fake 0.40 "basket"
        books[f"n{i}"] = make_book(f"n{i}", 0.58, 0.62)
    opps = NegRiskArb(config, fees).find([], books, [event])
    assert all(o.kind != "negrisk_yes_arb" for o in opps)


# --- finding: fees must accumulate per level, not at the average price ----
def test_depth_fees_per_level_not_average():
    fee = FeeModel(overrides={"x": 0.10})
    fee_fn = lambda p: fee.taker_fee(1, p, "x")
    yes = OrderBook("y", bids=[BookLevel(0.01, 1)],
                    asks=[BookLevel(0.30, 10), BookLevel(0.50, 10)])
    no = OrderBook("n", bids=[BookLevel(0.01, 1)], asks=[BookLevel(0.45, 20)])
    sized = size_basket([yes, no], 1.0, fee_fn, min_edge=0.0)
    shares, avg_prices, _, total_cost = sized
    assert shares == pytest.approx(20)
    per_level_fees = (10 * fee_fn(0.30) + 10 * fee_fn(0.50) + 20 * fee_fn(0.45))
    expected = 10 * 0.30 + 10 * 0.50 + 20 * 0.45 + per_level_fees
    assert total_cost == pytest.approx(expected)
    # the old (wrong) fee at avg price would be strictly larger
    assert total_cost < 10 * 0.30 + 10 * 0.50 + 20 * 0.45 \
        + 20 * fee_fn(0.40) + 20 * fee_fn(0.45) + 1e-12


# --- finding: fills must book at the walked average, not the limit price --
def test_paper_books_at_average_not_limit_price(config):
    p = Portfolio(100.0)
    ex = PaperExecutor(p, FeeModel(default_rate=0.0))
    opp = Opportunity(
        strategy="negrisk_arb", kind="negrisk_yes_arb", description="t",
        legs=[Leg("y", "BUY", 0.50, 20, "Q?", "Yes", "geopolitics", "0xc",
                  avg_price=0.40)],
        edge=0.1, expected_profit=2.0, total_cost=8.0, guaranteed=True, key="k",
    )
    ex.execute(opp)
    pos = p.positions()[0]
    assert pos.avg_price == pytest.approx(0.40)   # not 0.50
    assert p.cash == pytest.approx(100 - 8.0)


# --- finding: hedged maker pairs are not "inventory" ----------------------
def _pair_positions(p: Portfolio, yes_sh=10, no_sh=10):
    p.apply_buy(Fill("ty", "BUY", 0.48, yes_sh, 0.0, now_iso(),
                     "market_maker", "Q?", "Yes", "0xmm"))
    p.apply_buy(Fill("tn", "BUY", 0.49, no_sh, 0.0, now_iso(),
                     "market_maker", "Q?", "No", "0xmm"))


def test_inventory_stop_spares_hedged_pairs(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    config.mode = "live"  # live never auto-merges, pairs persist
    bot = Bot(config, scanner=_dummy_scanner(),
              executor=PaperExecutor(Portfolio(100.0), FeeModel()))
    bot.executor.portfolio = bot.portfolio
    _pair_positions(bot.portfolio)
    crash = {"ty": make_book("ty", 0.30, 0.32)}   # 18c below cost — but hedged
    assert bot._inventory_stops(crash) == 0
    assert bot.portfolio.open_position_count() == 2


def test_inventory_stop_dumps_only_unpaired_excess(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    config.mode = "live"
    bot = Bot(config, scanner=_dummy_scanner(),
              executor=PaperExecutor(Portfolio(100.0), FeeModel()))
    bot.executor.portfolio = bot.portfolio
    _pair_positions(bot.portfolio, yes_sh=15, no_sh=10)  # 5 unpaired YES
    crash = {"ty": make_book("ty", 0.30, 0.32, bid_size=500)}
    assert bot._inventory_stops(crash) == 1
    yes_pos = next(p for p in bot.portfolio.positions() if p.outcome == "Yes")
    assert yes_pos.shares == pytest.approx(10)    # pair kept, excess dumped
    # and the market is in quoting cooldown now
    assert bot._quote_cooldown.get("0xmm", 0) > bot._cycle


def test_unpaired_inventory_cost_ignores_pairs(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    config.mode = "live"
    bot = Bot(config, scanner=_dummy_scanner(),
              executor=PaperExecutor(Portfolio(100.0), FeeModel()))
    bot.executor.portfolio = bot.portfolio
    _pair_positions(bot.portfolio, yes_sh=14, no_sh=14)   # $13.58 fully hedged
    assert bot._unpaired_inventory_cost("0xmm") == pytest.approx(0.0)
    _pair_positions(bot.portfolio, yes_sh=4, no_sh=0)     # add unpaired YES
    assert bot._unpaired_inventory_cost("0xmm") > 0


# --- finding: exits must respect book depth -------------------------------
def test_exit_position_is_depth_aware(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    bot = Bot(config, scanner=_dummy_scanner())
    p = bot.portfolio
    p.apply_buy(Fill("tv", "BUY", 0.55, 50, 0.0, now_iso(),
                     "value_favorites", "Q?", "Yes", "0xv"))
    # thin top level, junk below the floor
    ob = OrderBook("tv", bids=[BookLevel(0.40, 1), BookLevel(0.10, 500)],
                   asks=[BookLevel(0.60, 10)])
    assert bot._value_stops({"tv": ob}) == 1
    pos = p.positions()[0]
    assert pos.shares == pytest.approx(49)        # only 1 share was sellable
    sell = p.state["fills"][-1]
    assert sell["price"] == pytest.approx(0.40)   # walked price, not fantasy


# --- finding: drawdown halt must see marks, not cost ----------------------
def test_halt_fires_on_mark_to_market_drawdown(config):
    p = Portfolio(100.0)
    p.apply_buy(Fill("t1", "BUY", 0.90, 70 / 0.9, 0.0, now_iso(),
                     "value_favorites", "Q?", "Yes", "0x1"))
    rm = RiskManager(config, p)
    assert rm.halted() is None                    # at cost: equity == 100
    rm.set_marks({"t1": 0.10})                    # position collapsed
    assert rm.halted() is not None                # MTM equity ~ $37.7 < $75


# --- finding: cooldown blocks requoting a stopped market ------------------
def test_cooldown_blocks_maker_requote(config, tmp_path):
    config.state_file = str(tmp_path / "s.json")
    from polybot.scanner import ScanResult
    bot = Bot(config, scanner=_dummy_scanner())
    bot._quote_cooldown["0xmm"] = bot._cycle + 10
    opp = Opportunity(
        strategy="market_maker", kind="maker_quote", description="q",
        legs=[Leg("ty", "BUY", 0.46, 10, "Q?", "Yes", "sports", "0xmm"),
              Leg("tn", "BUY", 0.46, 10, "Q?", "No", "sports", "0xmm")],
        edge=0.08, expected_profit=0.8, total_cost=9.2, guaranteed=False,
        key="maker:0xmm", execution="maker",
    )
    placed = bot._manage_quotes(ScanResult(opportunities=[opp]))
    assert placed == 0
    assert bot.portfolio.open_orders() == []


# --- finding: atomic fill bookkeeping -------------------------------------
def test_fill_open_order_state_always_consistent(config, tmp_path):
    """After any fill, order decrement and position booking are in the SAME
    persisted image (cash+reserved+cost is conserved)."""
    state = tmp_path / "s.json"
    p = Portfolio(100.0, str(state))
    from polybot.models import OpenOrder
    p.add_open_order(OpenOrder(order_id="o1", token_id="t", side="BUY",
                               price=0.40, shares=100, strategy="market_maker",
                               market_question="Q?", outcome="Yes",
                               condition_id="0xc", quote_key="maker:0xc"))
    p.fill_open_order("o1", 40)
    reloaded = Portfolio(100.0, str(state))
    total = (reloaded.cash + reloaded.reserved
             + sum(pos.cost_basis for pos in reloaded.positions()))
    assert total == pytest.approx(100.0)
    assert reloaded.open_orders()[0].shares == pytest.approx(60)
    assert reloaded.positions()[0].shares == pytest.approx(40)
