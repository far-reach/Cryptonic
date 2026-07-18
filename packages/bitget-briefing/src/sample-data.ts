import type { Announcement } from "./types.js";

/**
 * Representative sample announcements (titles modelled on real Bitget announcement-center
 * entries) used by `--demo` to preview the briefing format without network access,
 * and by the test suite.
 */
export function sampleAnnouncements(now: number): Announcement[] {
  const h = 3_600_000;
  return [
    {
      id: "1001",
      title: "Notice on the Delisting of XYZ/USDT Spot Trading Pair",
      url: "https://www.bitget.com/support/articles/1001",
      section: "symbol_delisting",
      publishedAt: now - 3 * h,
    },
    {
      id: "1002",
      title: "ABC Network Upgrade: Deposits and Withdrawals Temporarily Suspended",
      url: "https://www.bitget.com/support/articles/1002",
      section: "maintenance_system_updates",
      publishedAt: now - 6 * h,
    },
    {
      id: "1003",
      title: "Bitget Futures: Adjustment of Leverage and Funding Rate for DEFUSDT Perpetual",
      url: "https://www.bitget.com/support/articles/1003",
      section: "latest_news",
      publishedAt: now - 10 * h,
    },
    {
      id: "1004",
      title: "Bitget Will List NewCoin (NEW) in the Innovation Zone",
      url: "https://www.bitget.com/support/articles/1004",
      section: "coin_listings",
      publishedAt: now - 5 * h,
    },
    {
      id: "1005",
      title: "Bitget API Update: WebSocket Endpoint Changes Effective Next Week",
      url: "https://www.bitget.com/support/articles/1005",
      section: "api_trading",
      publishedAt: now - 12 * h,
    },
    {
      id: "1006",
      title: "Trade GHI to Share a 100,000 USDT Prize Pool!",
      url: "https://www.bitget.com/support/articles/1006",
      section: "trading_competitions_promotions",
      publishedAt: now - 8 * h,
    },
    {
      id: "1007",
      title: "Bitget Launchpool: Stake BGB to Earn JKL",
      url: "https://www.bitget.com/support/articles/1007",
      section: "trading_competitions_promotions",
      publishedAt: now - 20 * h,
    },
    {
      id: "1000",
      title: "Old News From Three Days Ago (should not appear)",
      url: "https://www.bitget.com/support/articles/1000",
      section: "latest_news",
      publishedAt: now - 72 * h,
    },
  ];
}
