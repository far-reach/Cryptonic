"""End-to-end wiring: fake market data -> scanner -> risk -> paper fills."""

from conftest import gamma_market_raw, make_book

from polybot.bot import Bot
from polybot.models import Market, OrderBook
from polybot.scanner import Scanner


class FakeGamma:
    def __init__(self, markets_raw, events):
        self._markets = markets_raw
        self._events = events

    def active_markets(self, pages=1, page_size=100, min_volume_24h=0.0):
        out = []
        for raw in self._markets:
            m = Market.from_gamma(raw)
            if m:
                out.append(m)
        return out

    def negrisk_events(self, pages=2, page_size=50):
        return self._events


class FakeClob:
    def __init__(self, books: dict[str, OrderBook]):
        self._books = books

    def books(self, token_ids):
        return {t: self._books[t] for t in token_ids if t in self._books}

    def book(self, token_id):
        return self._books.get(token_id)


def test_full_cycle_takes_arb_and_respects_budget(config, tmp_path):
    config.state_file = str(tmp_path / "portfolio.json")
    # one market with a fat complement arb: YES 0.44 + NO 0.50 = 0.94
    # tight indicative spread gets the market past the book-fetch prefilter;
    # the actual (de-synced) books then reveal the arb
    markets_raw = [gamma_market_raw(question="Arb here?", yes="y1", no="n1",
                                    bestBid=0.43, bestAsk=0.44)]
    books = {
        "y1": make_book("y1", 0.42, 0.44, ask_size=1000),
        "n1": make_book("n1", 0.48, 0.50, ask_size=1000),
    }
    scanner = Scanner(config, gamma=FakeGamma(markets_raw, []), clob=FakeClob(books))
    bot = Bot(config, scanner=scanner)

    trades = bot.run_once()
    assert trades == 1
    # trade capped at max_trade_usdc even though books had $940 of depth
    assert bot.portfolio.deployed() <= config.risk.max_trade_usdc + 1e-6
    assert bot.portfolio.cash >= 90.0 - 1e-6
    # both legs held
    assert bot.portfolio.open_position_count() == 2
    # second cycle with identical books: dedupe blocks a re-entry
    assert bot.run_once() == 0


def test_cycle_with_no_opportunities(config, tmp_path):
    config.state_file = str(tmp_path / "portfolio.json")
    markets_raw = [gamma_market_raw(question="Fair market?", yes="y2", no="n2")]
    books = {
        "y2": make_book("y2", 0.49, 0.51, ask_size=100),
        "n2": make_book("n2", 0.48, 0.50, ask_size=100),
    }
    scanner = Scanner(config, gamma=FakeGamma(markets_raw, []), clob=FakeClob(books))
    bot = Bot(config, scanner=scanner)
    assert bot.run_once() == 0
    assert bot.portfolio.cash == 100.0


def test_state_persists_across_restart(config, tmp_path):
    config.state_file = str(tmp_path / "portfolio.json")
    markets_raw = [gamma_market_raw(question="Arb?", yes="y3", no="n3",
                                    bestBid=0.41, bestAsk=0.42)]
    books = {
        "y3": make_book("y3", 0.40, 0.42, ask_size=500),
        "n3": make_book("n3", 0.50, 0.52, ask_size=500),
    }
    scanner = Scanner(config, gamma=FakeGamma(markets_raw, []), clob=FakeClob(books))
    bot = Bot(config, scanner=scanner)
    bot.run_once()
    cash_after = bot.portfolio.cash

    # "restart": new Bot loads the same state file and must not re-trade
    scanner2 = Scanner(config, gamma=FakeGamma(markets_raw, []), clob=FakeClob(books))
    bot2 = Bot(config, scanner=scanner2)
    assert bot2.portfolio.cash == cash_after
    assert bot2.run_once() == 0
