# Announcement → price-reaction research behind the "Trade angles" section

The `signals.ts` heuristics encode findings from event-study literature and market
practice on how exchange announcements correlate with subsequent price action.
They are statistical tendencies, not guarantees, and **not financial advice**.

## Listings (→ `avoid-chase`)

Event studies of exchange listings find significant positive abnormal returns
concentrated *around* the event, not after it: ≈5.7–6.5% on the listing day and
≈9–10% over the surrounding week, with ≈5% of that accruing in the **three days
before** the event (information leaks / front-running). Effects are largest for
big-venue listings (the "Coinbase/Binance effect") and fade afterward — buying
the pop late has historically been the losing side of the trade. The suggested
angle is patience: the post-listing retrace has been the better entry.

- [Market Reaction to Exchange Listings of Cryptocurrencies (Blockchain Research Lab working paper)](https://www.blockchainresearchlab.org/wp-content/uploads/2019/10/Exploring-Market-Reactions-to-Exchange-Listings-of-Cryptocurrencies-BRL-working-paper3.pdf)
- [Market Reaction to Exchange Listings of Cryptocurrencies (ResearchGate)](https://www.researchgate.net/publication/335690724_Market_Reaction_to_Exchange_Listings_of_Cryptocurrencies)
- [Announcement effects in the cryptocurrency market (ResearchGate)](https://www.researchgate.net/publication/341117503_Announcement_effects_in_the_cryptocurrency_market)
- [Market reactions to crypto-specific announcements (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0165176525001429)

## Delistings (→ `exit-risk`)

Delisting announcements are followed by fast, deep drawdowns: typically −20…−40%
within days (worst cases −70%+, and ≈−80% within a month), driven by forced
sellers who must exit before the removal date, market makers pulling liquidity,
and evaporating demand. Bounces after the initial capitulation have historically
been liquidity traps. Risk tags ("ST", risk warnings) often precede delistings
(→ `short-bias`).

- [Delisting in Crypto — PrimeXBT glossary](https://primexbt.com/glossary/delisting-definition/)
- [Delisting causes and effects — Volity](https://volity.io/crypto/delisting/)
- [Crypto futures delisting: detection & protection — Arbitron](https://arbitron.app/learn/delist-detection)

## Deposit/withdrawal suspensions & resumptions (→ `arb-watch`)

While transfers are frozen, arbitrageurs cannot move coins between venues, so
the exchange-local price can decouple from the global market (premium or
discount). Resumption reconnects arbitrage: the gap tends to snap shut, and
holders who were trapped can finally move/sell — a supply event. Cross-exchange
spread and funding-rate arbitrage around these windows is a documented practice.

- [Cross-exchange listing/delisting arbitrage signals — Arbitron](https://arbitron.app/listings)

## Contract parameter changes (→ `vol-watch`)

Funding-rate interval shortening, leverage caps, margin-tier or position-limit
tightening are the exchange de-risking a contract — a flag that it sees unusual
volatility or thin liquidity. These frequently precede volatile episodes (and
sometimes delistings). The angle is defensive: smaller size, wider stops,
expect funding swings. New margin availability tends to raise short-term
volume and volatility.

## Entry / TP / SL brackets

When a live Bitget spot price is available for the signal's coin, the briefing
attaches mechanical brackets anchored to the research above (percentages from
the last price at briefing time — rules of thumb, **not price predictions**):

| Stance | Side | Entry | Take profit | Stop loss | Anchor |
|---|---|---|---|---|---|
| exit-risk (delisting) | short | last | −30% | +12% | documented −20…−40% drift; SL above typical dead-cat bounce |
| short-bias (risk tag) | short | last | −15% | +8% | pre-delisting negative drift |
| arb-watch (resumption only) | short | last | −5% | +4% | reconnect supply wave / premium close |
| avoid-chase (listing/launch) | long | last −15% | back to last (+15%) | −10% below entry | post-listing retrace magnitude |
| vol-watch | — | no levels | | | signal is about sizing, not direction |

Frozen-transfer `arb-watch` signals carry no levels (nothing tradable until
transfers reopen), and stablecoins never get levels.

## Launch events (→ `avoid-chase`)

Launchpool/pre-market reward tokens face concentrated sell pressure when farmed
rewards unlock; the historically better entry is after the first claim-and-dump
wave rather than at launch.
