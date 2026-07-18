"""Command-line interface.

  python -m polybot scan            one-shot scan, print opportunities
  python -m polybot run             trading loop (paper mode by default)
  python -m polybot run --live      real orders (needs env keys + ack)
  python -m polybot status          portfolio snapshot
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .bot import Bot
from .config import Config
from .portfolio import Portfolio


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def cmd_scan(cfg: Config) -> int:
    from .scanner import Scanner
    opportunities = Scanner(cfg).scan().opportunities
    if not opportunities:
        print("No opportunities passed the filters this cycle. "
              "That is normal — arbitrage windows are rare and short-lived. "
              "Run the loop (`python -m polybot run`) to catch them.")
        return 0
    print(f"{len(opportunities)} opportunit{'y' if len(opportunities) == 1 else 'ies'}:\n")
    for opp in opportunities:
        tag = "QUOTE" if opp.execution == "maker" else opp.summary()
        print(" ", f"[MAKER] {opp.description}" if opp.execution == "maker" else tag)
        for leg in opp.legs:
            print(f"      {leg.side} {leg.shares:.1f} {leg.outcome}"
                  f" @ {leg.price:.3f}  ({leg.market_question[:60]})")
    return 0


def cmd_run(cfg: Config, live: bool) -> int:
    cfg.mode = "live" if live else "paper"
    bot = Bot(cfg)
    bot.run_forever()
    return 0


def cmd_status(cfg: Config) -> int:
    p = Portfolio(cfg.risk.bankroll_usdc, cfg.state_file)
    print(json.dumps({
        "cash": round(p.cash, 2),
        "reserved_by_orders": round(p.reserved, 2),
        "deployed_at_cost": round(p.deployed(), 2),
        "equity_at_cost": round(p.equity(), 2),
        "realized_pnl": round(float(p.state["realized_pnl"]), 2),
        "open_positions": p.open_position_count(),
        "open_orders": len(p.state["open_orders"]),
        "fills": len(p.state["fills"]),
    }, indent=2))
    for pos in p.positions():
        print(f"  POS   {pos.outcome:>3} x{pos.shares:8.2f} @ {pos.avg_price:.3f}"
              f"  [{pos.strategy}] {pos.market_question[:60]}")
    for o in p.open_orders():
        print(f"  ORDER {o.side:>4} x{o.shares:8.2f} @ {o.price:.3f}"
              f"  [{o.strategy}] {o.market_question[:60]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="polybot",
                                     description="Polymarket opportunity scanner & trading bot")
    parser.add_argument("-c", "--config", help="path to config.yaml")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scan", help="one-shot opportunity scan")
    run_p = sub.add_parser("run", help="continuous trading loop")
    run_p.add_argument("--live", action="store_true",
                       help="place real orders (default: paper trading)")
    sub.add_parser("status", help="portfolio snapshot")

    args = parser.parse_args(argv)
    _setup_logging(args.verbose)
    cfg = Config.load(args.config)

    if args.command == "scan":
        return cmd_scan(cfg)
    if args.command == "run":
        return cmd_run(cfg, getattr(args, "live", False))
    if args.command == "status":
        return cmd_status(cfg)
    return 1


if __name__ == "__main__":
    sys.exit(main())
