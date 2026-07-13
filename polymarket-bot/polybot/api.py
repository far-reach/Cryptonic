"""Read-only HTTP clients for Polymarket's public APIs (Gamma + CLOB).

No authentication is required for anything in this module. Trading happens
in polybot.executor.live via py_clob_client_v2.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import requests

from .config import CLOB_HOST, GAMMA_HOST
from .models import Market, OrderBook

log = logging.getLogger(__name__)


class Http:
    def __init__(self, timeout: float = 15.0, max_retries: int = 3):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "polybot/0.1 (research)"
        self.timeout = timeout
        self.max_retries = max_retries

    def get(self, url: str, params: dict | None = None) -> Any:
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                if resp.status_code == 429:  # rate limited — back off harder
                    time.sleep(2.0 * (attempt + 1))
                    continue
                resp.raise_for_status()
                return resp.json()
            except (requests.RequestException, ValueError) as e:
                last_err = e
                time.sleep(0.5 * 2**attempt)
        raise ConnectionError(f"GET {url} failed after {self.max_retries} tries: {last_err}")


class GammaClient:
    """gamma-api.polymarket.com — market/event metadata and indicative prices."""

    def __init__(self, http: Http | None = None, host: str = GAMMA_HOST):
        self.http = http or Http()
        self.host = host

    def active_markets(self, pages: int = 4, page_size: int = 100,
                       min_volume_24h: float = 0.0) -> list[Market]:
        """Active, open binary markets ordered by 24h volume (descending)."""
        out: list[Market] = []
        for page in range(pages):
            batch = self.http.get(f"{self.host}/markets", params={
                "active": "true",
                "closed": "false",
                "order": "volume24hr",
                "ascending": "false",
                "limit": page_size,
                "offset": page * page_size,
            })
            if not batch:
                break
            for raw in batch:
                m = Market.from_gamma(raw)
                if m and m.active and not m.closed and m.volume_24h >= min_volume_24h:
                    out.append(m)
            if len(batch) < page_size:
                break
        return out

    def negrisk_events(self, pages: int = 2, page_size: int = 50) -> list[dict]:
        """Active negative-risk (mutually exclusive multi-outcome) events,
        each with nested markets."""
        events: list[dict] = []
        for page in range(pages):
            batch = self.http.get(f"{self.host}/events", params={
                "active": "true",
                "closed": "false",
                "order": "volume24hr",
                "ascending": "false",
                "limit": page_size,
                "offset": page * page_size,
            })
            if not batch:
                break
            events.extend(e for e in batch if e.get("negRisk"))
            if len(batch) < page_size:
                break
        return events


class ClobClient:
    """clob.polymarket.com — order books and prices (public endpoints)."""

    def __init__(self, http: Http | None = None, host: str = CLOB_HOST):
        self.http = http or Http()
        self.host = host

    def book(self, token_id: str) -> Optional[OrderBook]:
        try:
            data = self.http.get(f"{self.host}/book", params={"token_id": token_id})
        except ConnectionError as e:
            log.warning("book fetch failed for %s: %s", token_id[:16], e)
            return None
        if not isinstance(data, dict):
            return None
        ob = OrderBook.from_clob(data)
        ob.token_id = ob.token_id or token_id
        return ob

    def books(self, token_ids: list[str]) -> dict[str, OrderBook]:
        """Batch order books via POST /books (falls back to per-token GET)."""
        result: dict[str, OrderBook] = {}
        CHUNK = 100
        for i in range(0, len(token_ids), CHUNK):
            chunk = token_ids[i:i + CHUNK]
            try:
                resp = self.http.session.post(
                    f"{self.host}/books",
                    json=[{"token_id": t} for t in chunk],
                    timeout=self.http.timeout,
                )
                resp.raise_for_status()
                for entry in resp.json():
                    ob = OrderBook.from_clob(entry)
                    if ob.token_id:
                        result[ob.token_id] = ob
            except (requests.RequestException, ValueError):
                for t in chunk:
                    ob = self.book(t)
                    if ob:
                        result[t] = ob
        return result
