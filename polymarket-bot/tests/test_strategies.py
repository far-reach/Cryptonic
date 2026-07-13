import json

from conftest import gamma_market_raw, make_book, make_market

from polybot.fees import FeeModel
from polybot.models import Market
from polybot.strategies.complement_arb import ComplementArb
from polybot.strategies.negrisk_arb import NegRiskArb
from polybot.strategies.value import ValueFavorites


# ---------------------------------------------------------------- complement
def test_complement_arb_detects_underpriced_pair(config, fees):
    m = make_market()
    books = {
        "tok_yes": make_book("tok_yes", 0.45, 0.47, ask_size=200),
        "tok_no": make_book("tok_no", 0.49, 0.50, ask_size=300),
    }
    opps = ComplementArb(config, fees).find([m], books, [])
    assert len(opps) == 1
    opp = opps[0]
    assert opp.guaranteed
    # sized to the shallower leg
    assert all(leg.shares == 200 for leg in opp.legs)
    # edge = 1 - 0.97 - fees; weather rate 0.05
    fee = 0.05 * (0.47 * 0.53 + 0.50 * 0.50)
    assert abs(opp.edge - (1 - 0.97 - fee)) < 1e-9
    assert opp.expected_profit > 0


def test_complement_arb_rejects_fair_pair(config, fees):
    m = make_market()
    books = {
        "tok_yes": make_book("tok_yes", 0.49, 0.51),
        "tok_no": make_book("tok_no", 0.48, 0.50),
    }
    assert ComplementArb(config, fees).find([m], books, []) == []


def test_complement_arb_fee_kills_marginal_edge(config, fees):
    # pair at 0.985 looks like 1.5% edge but fees (~2.5% of a share at p~0.5)
    # push it below the 0.5% threshold
    m = make_market(category="crypto")  # highest fee rate
    books = {
        "tok_yes": make_book("tok_yes", 0.47, 0.49),
        "tok_no": make_book("tok_no", 0.47, 0.495),
    }
    assert ComplementArb(config, fees).find([m], books, []) == []
    # same prices with zero fees would pass
    assert ComplementArb(config, FeeModel(default_rate=0.0, overrides={"crypto": 0.0})) \
        .find([m], books, []) != []


def test_complement_arb_missing_book_is_skipped(config, fees):
    m = make_market()
    books = {"tok_yes": make_book("tok_yes", 0.4, 0.42)}
    assert ComplementArb(config, fees).find([m], books, []) == []


# ------------------------------------------------------------------ negrisk
def _negrisk_event(n=3, yes_asks=(0.30, 0.30, 0.30), title="Who wins?"):
    markets = []
    for i in range(n):
        markets.append(gamma_market_raw(
            question=f"Candidate {i}?", condition_id=f"0xc{i}",
            yes=f"y{i}", no=f"n{i}", negRisk=True,
        ))
    return {
        "slug": "who-wins", "title": title, "negRisk": True,
        "negRiskAugmented": False, "endDate": "2026-08-01T00:00:00Z",
        "category": "Politics", "markets": markets,
    }


def test_negrisk_yes_basket_arb(config, fees):
    event = _negrisk_event()
    books = {}
    for i, ask in enumerate((0.30, 0.32, 0.33)):  # sum 0.95
        books[f"y{i}"] = make_book(f"y{i}", ask - 0.02, ask, ask_size=100)
        books[f"n{i}"] = make_book(f"n{i}", 0.60, 0.75, ask_size=100)  # NO basket unattractive
    opps = NegRiskArb(config, fees).find([], books, [event])
    yes_opps = [o for o in opps if o.kind == "negrisk_yes_arb"]
    assert len(yes_opps) == 1
    opp = yes_opps[0]
    assert opp.guaranteed and len(opp.legs) == 3
    assert opp.expected_profit > 0
    assert all(leg.shares == 100 for leg in opp.legs)


def test_negrisk_no_basket_arb(config, fees):
    event = _negrisk_event()
    books = {}
    # YES prices sum > 1 (overpriced) -> NO basket cheap: NO asks sum 1.94 < 2
    for i, no_ask in enumerate((0.64, 0.65, 0.63)):
        books[f"y{i}"] = make_book(f"y{i}", 0.34, 0.38, ask_size=50)
        books[f"n{i}"] = make_book(f"n{i}", no_ask - 0.02, no_ask, ask_size=50)
    opps = NegRiskArb(config, fees).find([], books, [event])
    no_opps = [o for o in opps if o.kind == "negrisk_no_arb"]
    assert len(no_opps) == 1
    assert no_opps[0].guaranteed
    # payout n-1 = 2, cost 1.92 + fees -> positive edge
    assert no_opps[0].expected_profit > 0


def test_negrisk_augmented_event_skips_yes_basket(config, fees):
    event = _negrisk_event()
    event["negRiskAugmented"] = True
    books = {}
    for i, ask in enumerate((0.30, 0.30, 0.30)):  # obvious YES arb if allowed
        books[f"y{i}"] = make_book(f"y{i}", ask - 0.02, ask)
        books[f"n{i}"] = make_book(f"n{i}", 0.68, 0.70)
    opps = NegRiskArb(config, fees).find([], books, [event])
    assert all(o.kind != "negrisk_yes_arb" for o in opps)


def test_negrisk_fair_prices_no_opportunity(config, fees):
    event = _negrisk_event()
    books = {}
    for i, ask in enumerate((0.34, 0.34, 0.34)):  # sum 1.02, NO sum ~1.98+spr
        books[f"y{i}"] = make_book(f"y{i}", ask - 0.02, ask)
        books[f"n{i}"] = make_book(f"n{i}", 0.66, 0.68)
    assert NegRiskArb(config, fees).find([], books, [event]) == []


def test_negrisk_missing_leg_book_skips_event(config, fees):
    event = _negrisk_event()
    books = {"y0": make_book("y0", 0.28, 0.30)}  # only one leg available
    assert NegRiskArb(config, fees).find([], books, [event]) == []


# -------------------------------------------------------------------- value
def _near_end_market(**kw):
    from datetime import datetime, timedelta, timezone
    end = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    return make_market(end_date=end, category="politics", **kw)


def test_value_buys_cheap_favorite(config, fees):
    m = _near_end_market()
    books = {
        "tok_yes": make_book("tok_yes", 0.93, 0.94, ask_size=1000),
        "tok_no": make_book("tok_no", 0.055, 0.07),
    }
    opps = ValueFavorites(config, fees).find([m], books, [])
    assert len(opps) == 1
    opp = opps[0]
    assert not opp.guaranteed
    assert opp.legs[0].outcome == "Yes"
    assert opp.total_cost <= config.risk.max_trade_usdc + 1e-6


def test_value_detects_no_side_favorite(config, fees):
    m = _near_end_market()
    books = {
        "tok_yes": make_book("tok_yes", 0.04, 0.06),
        "tok_no": make_book("tok_no", 0.93, 0.94, ask_size=1000),
    }
    opps = ValueFavorites(config, fees).find([m], books, [])
    assert len(opps) == 1
    assert opps[0].legs[0].outcome == "No"


def test_value_skips_far_expiry(config, fees):
    m = make_market(end_date="2027-06-01T00:00:00Z", category="politics")
    books = {"tok_yes": make_book("tok_yes", 0.93, 0.94),
             "tok_no": make_book("tok_no", 0.05, 0.07)}
    assert ValueFavorites(config, fees).find([m], books, []) == []


def test_value_skips_low_volume(config, fees):
    m = _near_end_market(volume_24h=100.0)
    books = {"tok_yes": make_book("tok_yes", 0.93, 0.94),
             "tok_no": make_book("tok_no", 0.05, 0.07)}
    assert ValueFavorites(config, fees).find([m], books, []) == []


def test_value_skips_mid_prices(config, fees):
    m = _near_end_market()
    books = {"tok_yes": make_book("tok_yes", 0.55, 0.57),
             "tok_no": make_book("tok_no", 0.43, 0.45)}
    assert ValueFavorites(config, fees).find([m], books, []) == []


def test_value_skips_wide_spread(config, fees):
    m = _near_end_market()
    books = {"tok_yes": make_book("tok_yes", 0.88, 0.94),
             "tok_no": make_book("tok_no", 0.05, 0.07)}
    assert ValueFavorites(config, fees).find([m], books, []) == []


# ------------------------------------------------------------------- models
def test_gamma_market_parsing():
    raw = gamma_market_raw()
    m = Market.from_gamma(raw)
    assert m is not None
    assert m.yes_token_id == "111" and m.no_token_id == "222"
    assert m.category == "politics"
    assert m.best_bid == 0.48 and m.best_ask == 0.52


def test_gamma_market_parsing_bad_tokens_returns_none():
    raw = gamma_market_raw()
    raw["clobTokenIds"] = json.dumps(["only-one"])
    assert Market.from_gamma(raw) is None
    raw["clobTokenIds"] = "not json"
    assert Market.from_gamma(raw) is None
