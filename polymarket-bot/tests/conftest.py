import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polybot.config import Config
from polybot.fees import FeeModel
from polybot.models import BookLevel, Market, OrderBook


@pytest.fixture
def config():
    cfg = Config()  # pure defaults; no yaml, no env
    cfg.state_file = ""
    return cfg


@pytest.fixture
def fees():
    return FeeModel()


def make_book(token_id: str, bid: float, ask: float,
              bid_size: float = 500.0, ask_size: float = 500.0) -> OrderBook:
    return OrderBook(
        token_id=token_id,
        bids=[BookLevel(bid, bid_size)],
        asks=[BookLevel(ask, ask_size)],
    )


def make_market(condition_id="0xc1", question="Will it rain tomorrow?",
                yes_token="tok_yes", no_token="tok_no", **kw) -> Market:
    defaults = dict(
        condition_id=condition_id, question=question, slug="will-it-rain",
        yes_token_id=yes_token, no_token_id=no_token,
        best_bid=0.50, best_ask=0.52, volume_24h=50_000.0, liquidity=20_000.0,
        end_date="2026-07-20T00:00:00Z", category="weather",
    )
    defaults.update(kw)
    return Market(**defaults)


def gamma_market_raw(question="Q?", condition_id="0xabc",
                     yes="111", no="222", **kw) -> dict:
    raw = {
        "conditionId": condition_id,
        "question": question,
        "slug": "q",
        "clobTokenIds": json.dumps([yes, no]),
        "outcomes": json.dumps(["Yes", "No"]),
        "bestBid": 0.48,
        "bestAsk": 0.52,
        "volume24hr": 10_000,
        "liquidityNum": 5_000,
        "endDate": "2026-08-01T00:00:00Z",
        "negRisk": False,
        "active": True,
        "closed": False,
        "events": [{"slug": "ev", "title": "Event", "category": "Politics"}],
    }
    raw.update(kw)
    return raw
