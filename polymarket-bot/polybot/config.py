"""Configuration: YAML file + environment variables.

Everything risk-related has a conservative default tuned for a $100 bankroll.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:  # pyyaml is optional; defaults still work
    yaml = None

GAMMA_HOST = "https://gamma-api.polymarket.com"
CLOB_HOST = "https://clob.polymarket.com"
DATA_HOST = "https://data-api.polymarket.com"
POLYGON_CHAIN_ID = 137


@dataclass
class RiskConfig:
    bankroll_usdc: float = 100.0          # total budget
    max_trade_usdc: float = 10.0          # cap per single opportunity
    max_market_usdc: float = 15.0         # cap per market (across strategies)
    max_deployed_frac: float = 0.80       # keep >=20% cash for fees/exits
    kelly_fraction: float = 0.25          # fractional Kelly for value bets
    max_value_positions: int = 8          # diversification floor for value strategy
    halt_drawdown_frac: float = 0.25      # stop all trading if equity < 75% of bankroll
    daily_loss_stop_usdc: float = 10.0    # stop for the day after losing this much


@dataclass
class StrategyConfig:
    # complement (YES+NO) arbitrage
    complement_enabled: bool = True
    complement_min_edge: float = 0.005      # >=0.5% after fees
    # negative-risk multi-outcome arbitrage
    negrisk_enabled: bool = True
    negrisk_min_edge: float = 0.008         # more legs -> more slippage risk
    negrisk_max_legs: int = 12
    # near-resolution value ("buy cheap certainty")
    value_enabled: bool = True
    value_min_price: float = 0.90           # only near-certain favorites
    value_max_price: float = 0.985
    value_max_days_to_end: float = 14.0
    value_min_annualized_return: float = 0.35   # 35%+ annualized after fees
    value_min_volume_24h: float = 5_000.0       # ignore dead markets
    value_min_liquidity: float = 2_000.0


@dataclass
class ScannerConfig:
    market_pages: int = 4              # pages of 100 markets, by 24h volume
    min_volume_24h: float = 500.0      # skip illiquid markets entirely
    poll_seconds: float = 30.0         # main loop interval
    book_top_n: int = 120              # fetch books for at most N candidates/cycle
    request_timeout: float = 15.0
    max_retries: int = 3


@dataclass
class Config:
    risk: RiskConfig = field(default_factory=RiskConfig)
    strategies: StrategyConfig = field(default_factory=StrategyConfig)
    scanner: ScannerConfig = field(default_factory=ScannerConfig)
    fee_overrides: dict = field(default_factory=dict)
    state_file: str = "state/portfolio.json"
    mode: str = "paper"                # "paper" or "live"

    # live-trading credentials (env only — never put keys in yaml)
    private_key: str = ""
    funder_address: str = ""
    signature_type: int = 0

    @classmethod
    def load(cls, path: str | None = None) -> "Config":
        cfg = cls()
        candidate = Path(path) if path else Path(__file__).resolve().parent.parent / "config.yaml"
        if yaml is not None and candidate.exists():
            raw = yaml.safe_load(candidate.read_text()) or {}
            for section, target in (("risk", cfg.risk), ("strategies", cfg.strategies),
                                    ("scanner", cfg.scanner)):
                for k, v in (raw.get(section) or {}).items():
                    if hasattr(target, k):
                        setattr(target, k, type(getattr(target, k))(v))
            cfg.fee_overrides = raw.get("fee_overrides") or {}
            cfg.state_file = raw.get("state_file", cfg.state_file)
        cfg.private_key = os.environ.get("POLYMARKET_PRIVATE_KEY", "")
        cfg.funder_address = os.environ.get("POLYMARKET_FUNDER_ADDRESS", "")
        cfg.signature_type = int(os.environ.get("POLYMARKET_SIGNATURE_TYPE", "0"))
        return cfg
