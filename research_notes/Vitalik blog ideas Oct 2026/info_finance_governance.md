# Vitalik's "Info Finance" and Governance-Mechanism Ideas: Development and Market Status as of October 8, 2026

Scope note: All findings below come from WebSearch snippets (direct page fetching was blocked). Every figure is dated where the source dates it. Where third-party trackers conflict, both numbers are given. The shared search budget ran out before a final round of follow-ups; the specific items that could not be checked are listed in each Gaps subsection.

Summary verdict table (details and sources in the sections below):

| Idea | Verdict | Biggest unfilled monetizable gap |
|---|---|---|
| 1a. Base prediction-market layer | Developed (hyper-scaled, ~$40B + ~$21B valuations, >$60B/month Kalshi volume) | Non-US regulated access (UK/EU) and a regulatory-clarity moat; the federal/state split is unresolved |
| 1b. Decision markets / futarchy | Partially developed (MetaDAO is the only revenue-generating implementation; Butter/Seer/Kleros are pilots) | No "decision markets as a service" product for companies/governments; no 2026 funded startup found |
| 1c. Prediction-market media | Partially developed (odds-licensing deals are abundant; only one small native outlet, Eventual) | A real prediction-market-native newsroom with original reporting and a revenue model beyond sponsorship |
| 1d. AI agents / long-tail micro-markets | Partially developed on the trading side (Polystrat, Public, Olas); largely undeveloped on the market-creation side | No productized AI-generated long-tail micro-market platform found |
| 1e. Vitalik's 2026 commentary | n/a | He himself named the gap: hedging-oriented, AI-assisted personal "expense baskets" |
| 2a. MACI / private voting | Partially developed (MACI v3 rated high maturity; no evidence of 2026 production DAO deployments found) | Trusted-coordinator removal and a turnkey hosted product |
| 2b. Vocdoni DAVINCI | Largely undeveloped commercially (July 2026 mainnet/TGE not confirmed; new Rust sequencer only reached v0.1.0 in late Sept 2026 on Gnosis) | Paid, non-crypto institutional elections at scale |
| 2c. Gov/union/shareholder crypto voting | Largely undeveloped (one university pilot; no 2026 government/union/shareholder deployments found) | Any paying institutional customer |
| 2d. Gitcoin / GG25 | Partially developed and shrinking (GG24 ~$1.8M; GG25 dates/pool unconfirmed; Techne spin-off planned Dec 2026) | A sustainable business model for QF (Grants Stack already sunset) |
| 2e. Deep Funding | Largely undeveloped (one $250k pilot + one $350k GG24 round with ~500 evaluations and $1,500 in trades) | Any commercial deployment; no repeat rounds at scale |
| 2f. "AI engine, human steering wheel" | Largely undeveloped (nonprofits and papers only; no funded startup found) | A product that sells distilled-human-judgment / sortition-jury oversight of AI |
| 3. Bridging / Community Notes beyond X | Partially developed (Meta, TikTok, YouTube run notes; X's AI Note Writer API open) | No cross-platform bridging-ranking API or startup; Jigsaw's Perspective API is being sunset after 2026 |

---

## Key Question 1a: Base prediction-market layer (Kalshi, Polymarket, regulation, new entrants) — numbers as of Q3/Q4 2026 and what changed July–October 2026

### Takeaway
The base layer is the one part of "info finance" that is fully developed and commercially enormous: Kalshi is finalizing a round at ~$40B (Aug–Oct 2026) on ~$60B of September notional volume, and Polymarket is raising ~$1B at $21B (reported Aug 31, 2026). The July–October 2026 story is a regulatory split (Ninth and Sixth Circuits ruled for the states; the Third Circuit for Kalshi), a pending CFTC final rule, and large incumbents (Robinhood, DraftKings, Public, Meta) building or routing their own exchanges.

### Cited Findings

Kalshi — valuation, funding, revenue, volume
- Kalshi announced a $1B Series F at a $22B valuation on May 7, 2026 (double the $11B Series E of December 2025), led by Coatue with Sequoia, a16z, IVP, Paradigm, Morgan Stanley and ARK — [TechCrunch, May 7, 2026](https://techcrunch.com/2026/05/07/kalshi-doubles-valuation-in-5-months-hitting-22-billion/); [Yahoo Finance](https://finance.yahoo.com/markets/options/articles/kalshi-raises-1-billion-series-113439811.html). Bloomberg reported the same $22B round on March 19–20, 2026, so sources conflict on whether the round was March or May — [CoinDesk, Mar 20, 2026](https://www.coindesk.com/business/2026/03/20/kalshi-valuation-doubles-to-usd22-billion-in-latest-funding-round-bloomberg); [Bloomberg](https://www.bloomberg.com/news/articles/2026-03-19/kalshi-gets-1-billion-in-new-funding-at-22-billion-valuation).
- At the $22B round Kalshi said annualized revenue exceeded $1.5B — [Yahoo Finance](https://finance.yahoo.com/markets/options/articles/kalshi-raises-1-billion-series-113439811.html). Sacra (third-party estimate) puts Kalshi at ~$4B annualized revenue by July 2026, driven largely by sports, and ~95% of US prediction-market revenue — [Sacra](https://sacra.com/c/kalshi/); [The Paypers](https://thepaypers.com/crypto-web3-and-cbdc/news/kalshi-nears-usd-40-bln-valuation-in-funding-round-ahead-of-ipo).
- On Aug 13, 2026 CoinDesk reported Kalshi in advanced talks with Sequoia and Wellington to raise at least $750M at a $40B valuation — [CoinDesk, Aug 13, 2026](https://www.coindesk.com/business/2026/08/13/kalshi-in-talks-with-sequoia-wellington-for-usd750-million-fund-raise-at-usd40-billion-valuation). Bloomberg reported ~Oct 1, 2026 that Kalshi is "finalizing" the ~$40B round, described as the last private raise before a possible 2027 IPO; no official close confirmed as of early October — [MarketScreener/Bloomberg](https://www.marketscreener.com/news/kalshi-finalizing-funding-round-at-about-40-billion-valuation-ce785ad3da88f623); [Yahoo/Bloomberg](https://finance.yahoo.com/markets/options/articles/kalshi-valuation-set-hit-40-212425602.html). CEO Tarek Mansour told CNBC in June 2026 that Kalshi is considering an IPO but ruled out 2026 — [Bonus.com](https://www.bonus.com/news/kalshi-reportedly-nears-40b-valuation-ahead-of-possible-2027-ipo/).
- Kalshi September 2026 notional volume: ~$60.7B, a monthly record; Oct 4, 2026 was its biggest single day; week of Sep 28–Oct 4 = $18.37B (record week) — [DeFi Rate volume tracker](https://defirate.com/prediction-markets/volume/kalshi/); [Prediction News](https://predictionnews.com/story/kalshi-volume-surges-but-rivals-gain-market-share). Note Kalshi counts contracts at $1 notional while Polymarket reports dollars paid, so the two are not directly comparable — [DeFi Rate aggregate](https://defirate.com/prediction-markets/volume/).
- Kalshi submitted a perpetual-style oil contract to the CFTC on Oct 2, 2026 — [CNBC prediction markets hub](https://www.cnbc.com/markets/prediction-markets/).

Polymarket — valuation, funding, revenue, volume
- Polymarket closed a round at a $15B valuation in April 2026 including a $600M investment from Intercontinental Exchange (NYSE owner), bringing in D.E. Shaw and G Squared — [CoinDesk, Aug 4, 2026](https://www.coindesk.com/markets/2026/08/04/polymarket-targets-usd20-billion-valuation-as-competition-heats-up-in-prediction-markets).
- Bloomberg (Aug 4, 2026) reported Polymarket seeking >$20B; on Aug 31, 2026 Bloomberg reported a ~$1B round led by 1789 Capital (Donald Trump Jr. is a partner) at a $21B post-money valuation, with 1789 contributing ~$300M on top of ~$200M already invested; a 1789 spokesperson confirmed the lead role on Sep 1 — [Bloomberg, Aug 31, 2026](https://www.bloomberg.com/news/articles/2026-08-31/polymarket-funding-round-led-by-1789-values-firm-at-21-billion); [CoinDesk, Sep 1, 2026](https://www.coindesk.com/business/2026/09/01/trump-jr-s-firm-leads-usd1-billion-polymarket-raise-at-usd21-billion-value-report). No source confirms the round has closed — [Pulse2](https://pulse2.com/polymarket-reportedly-raises-1-billion-at-21-billion-valuation-in-1789-capital-led-round/). Tracxn dates the round to Sep 1, 2026 and totals $3.3B raised over 8 rounds; Multiples says $3.9B over 9 rounds — [Tracxn](https://tracxn.com/d/companies/polymarket/__tyGnhK6h0nNQwFjEILKwDY6EySuY3ysyYIqXEnHEd9g/funding-and-investors); [Multiples](https://multiples.vc/private-comps/polymarket).
- Polymarket global monthly volume peaked at $10.5B in March 2026 and was $8.9B in May 2026; sports ~39–40% of volume, politics 32%, crypto 20%; Sacra estimates ~$1B annualized revenue as of June 2026, mostly taker fees on the global exchange — [Sacra](https://sacra.com/c/polymarket/).
- Polymarket US (CFTC-regulated entity) launched its iOS app via waitlist in May 2026 — [BettingUSA](https://www.bettingusa.com/prediction-markets/reviews/polymarket/); [Yahoo Finance](https://finance.yahoo.com/news/polymarket-launches-app-cftc-green-192317133.html). US fee schedule effective Apr 3, 2026: taker fee 0.05 with maker rebate -0.0125 per Sacra (other guides list 0.30% taker / 0.20% maker rebate; sources conflict) — [Sacra](https://sacra.com/c/polymarket/); [LaunchPoly](https://launchpoly.com/blog/polymarket-fees-costs-guide).
- September 2026 Polymarket US volume: DeFi Rate lists $8.8B as "biggest month" but $2.8B elsewhere on the same page (unresolved conflict); Prediction News says Polymarket weekly volume recently topped $4B; DeFi Rate's earlier article had Polymarket sliding to a $1.6B week while Kalshi set a $4.1B weekly high (~May 2026) — [DeFi Rate Polymarket US](https://defirate.com/prediction-markets/volume/polymarket-us/); [Prediction News](https://predictionnews.com/story/kalshi-volume-surges-but-rivals-gain-market-share); [DeFi Rate, May 2026](https://defirate.com/news/kalshi-sets-weekly-high-4-1b-volume-polymarket-slides/).
- Pew Research (Sep 23, 2026): prediction-market trading volume doubled between May and July 2026, largely driven by sports — [Pew Research](https://www.pewresearch.org/short-reads/2026/09/23/prediction-markets-trading-volume-doubled-between-may-and-july-largely-driven-by-sports/).
- CJR (Aug 2026) reported Polymarket's AI is feeding users fabricated information — [CJR](https://www.cjr.org/tag/polymarket).

CFTC rulemaking and state-law fights (chronology)
- Jan 29, 2026: Chairman Michael Selig withdrew the 2024 proposed ban on sports/political event contracts and rescinded the 2025 staff sports advisory — [CNBC, Jan 29, 2026](https://www.cnbc.com/2026/01/29/cftc-scraps-proposed-ban-on-sports-contracts-says-new-rules-coming.html); [CFTC PR 9179-26](https://www.cftc.gov/PressRoom/PressReleases/9179-26).
- March 2026: ANPRM on prediction markets — [Sidley](https://www.sidley.com/en/insights/newsupdates/2026/02/us-cftc-signals-imminent-rulemaking-on-prediction-markets).
- April 2026: CFTC sued Arizona, Connecticut and Illinois to assert exclusive jurisdiction; with DOJ it sued eight states total (AZ, CT, IL, NM, NY, MN, RI, WI) between April and June 2026 — [CFTC PR 9206-26](https://www.cftc.gov/PressRoom/PressReleases/9206-26); [DLA Piper, Sep 2026](https://www.dlapiper.com/en-us/insights/publications/2026/09/legal-status-at-odds-tracking-developments-in-prediction-markets-and-sports-betting).
- Apr 6, 2026: Third Circuit (divided) affirmed Kalshi's preliminary injunction against New Jersey; NJ has petitioned the Supreme Court — [Reuters via Investing.com](https://www.investing.com/news/stock-market-news/kalshi-cannot-block-nevada-oversight-of-sports-prediction-markets-us-appeals-court-rules-4881713); [CBS Sports state tracker](https://www.cbssports.com/prediction/news/prediction-market-legal-states/).
- Jun 10, 2026: 267-page NPRM (amending Rule 40.11, new Appendix F) that treats sports event contracts as "gaming" but permits most of them, reserving power to bar a subset; comment period closed Jul 27, 2026 — [Axios, Jun 10, 2026](https://www.axios.com/2026/06/10/cftc-prediction-markets-sports-event-contract-rules); [WilmerHale](https://www.wilmerhale.com/en/insights/client-alerts/20260618-10-takeaways-from-the-cftc-event-contracts-proposed-rulemaking); [Federal Register 2026-05105](https://www.cftc.gov/LawRegulation/FederalRegister/proposedrules/2026-05105.html).
- Jul 28, 2026: 44 states filed a joint letter saying the CFTC has no authority over sports prediction markets — [CNBC, Jul 28, 2026](https://www.cnbc.com/2026/07/28/44-states-say-cftc-has-no-authority-over-sports-prediction-markets.html).
- Aug 14, 2026: CNBC reported mounting scrutiny from regulators and banks; CFTC flagged "mentions" contracts as higher manipulation risk — [CNBC, Aug 14, 2026](https://www.cnbc.com/2026/08/14/prediction-markets-scrutiny-mounts-from-regulators-and-banks.html).
- Aug 28, 2026: Ninth Circuit ruled 3-0 that Nevada may require a gaming license for Kalshi's sports contracts, also rejecting Crypto.com's and Robinhood's appeals; creates a circuit split with the Third Circuit and sets up a likely Supreme Court fight — [CNBC, Aug 28, 2026](https://www.cnbc.com/2026/08/28/appeals-court-rules-against-prediction-markets-tees-up-scotus-fight.html); [CNN, Aug 28, 2026](https://www.cnn.com/2026/08/28/business/states-prediction-markets-gambling-federal-appeals-court); [The Hill](https://thehill.com/policy/technology/6058357-ninth-circuit-prediction-markets-kalshi-states-cftc/).
- Sep 25, 2026: Sixth Circuit held Kalshi's sports-event contracts are not "swaps" and Ohio and Tennessee may apply gambling law; Ohio's governor said the state will enforce — [CBS Sports](https://www.cbssports.com/prediction/news/prediction-market-legal-states/).
- Pending: Fourth Circuit (Maryland; argued May 7, 2026); Massachusetts SJC (sports contracts banned in MA pending appeal); Arizona criminal charges against Kalshi with a federal injunction on appeal; Rhode Island AG suit vs Kalshi and Polymarket with CFTC countersuit — [CBS Sports](https://www.cbssports.com/prediction/news/prediction-market-legal-states/); [Fox Sports state tracker](https://www.foxsports.com/stories/betting/prediction-markets-legal-states). As of August 2026, Washington became the fourth state blocking Kalshi (with Michigan, Nevada, Massachusetts) — [Fox Sports](https://www.foxsports.com/stories/betting/prediction-markets-legal-states).
- No final CFTC rule found as of Oct 8, 2026 — [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en-us/knowledge/publications/fed865b0/cftc-advances-regulatory-framework-for-prediction-markets); [CRS LSB11441](https://www.congress.gov/crs-product/LSB11441).
- UK: FCA markets chief Simon Walls confirmed on Oct 6, 2026 talks with Polymarket and Kalshi about UK entry; FCA says financial prediction products it examined are binary options and prohibited; sports/political contracts may need a Gambling Commission betting-intermediary licence — [Yahoo Finance, Oct 2026](https://finance.yahoo.com/markets/options/articles/polymarket-kalshi-coming-uk-fca-112215545.html).

New entrants (July–October 2026 specifically where noted)
- Robinhood (Sep 8, 2026): multiyear deals to route selected football contracts to Crypto.com's and OG.com's CFTC-regulated exchanges, taking equity stakes in both; continues routing through Kalshi, ForecastEX and its own CFTC-licensed exchange Rothera — [Robinhood newsroom](https://robinhood.com/us/en/newsroom/robinhood-cryptocom/); [PYMNTS](https://www.pymnts.com/partnerships/2026/robinhood-eyes-crypto-com-to-expand-role-on-prediction-market-stage/).
- DraftKings launched its own CFTC exchange DKeX on Jun 26, 2026, dropping CME and Crypto.com — [Bitcoin.com News](https://news.bitcoin.com/draftkings-drops-crypto-com-launches-own-prediction-market-exchange/); [Front Office Sports](https://frontofficesports.com/draftkings-coinbase-dive-into-prediction-markets-in-wild-week/).
- Crypto.com launched its prediction platform "OG" in Feb 2026 — [CU Today](https://www.cutoday.info/Fresh-Today/Robinhood-Expands-Prediction-Markets-Through-Crypto.com-Deal).
- Truth Predict (Trump Media + Crypto.com) was abandoned as an integrated product; replaced by a marketing deal promoting Crypto.com's products to Truth Social users (reported ~Aug 2026) — [Yahoo Finance](https://finance.yahoo.com/markets/crypto/articles/trump-media-abandons-crypto-treasury-210559341.html).
- Coinbase announced (late 2025) integration of Kalshi markets into its app; no confirmed 2026 launch date found — [Front Office Sports](https://frontofficesports.com/draftkings-coinbase-dive-into-prediction-markets-in-wild-week/).
- Public launched "AI Agents for Prediction Markets" on Sep 24, 2026 via a Kalshi tie-up — [Fortune, Sep 24, 2026](https://fortune.com/2026/09/24/public-ai-trading-agents-prediction-markets-kalshi-tie-up/); [PR Newswire](https://www.prnewswire.com/news-releases/public-launches-ai-agents-for-prediction-markets-302888505.html).
- Meta "Arena": NYT reported Jun 23, 2026 that Zuckerberg greenlit a Polymarket-like app, initially points-based; still in internal testing with no launch timeline as of July 2026 and insiders say it may never ship; no Sept/Oct 2026 update found — [TechCrunch, Jun 23, 2026](https://techcrunch.com/2026/06/23/mark-zuckerberg-wants-meta-to-launch-its-own-prediction-market/); [NPR, Jun 24, 2026](https://www.npr.org/2026/06/24/nx-s1-5869486/meta-prediction-market-app-ai); [Prediction News](https://predictionnews.com/story/meta-builds-experimental-prediction-markets-app-called-arena).
- Earnings: prediction markets featured across the August 2026 quarterly-earnings cycle — [CNBC, Aug 7, 2026](https://www.cnbc.com/2026/08/07/prediction-markets-take-center-stage-in-latest-quarterly-earnings.html).
- Offshore/crypto-native: Limitless (Base) hit ~$1.1B monthly volume (team-reported $3.4B vs independent $1.7B in one review); Myriad, Opinion Labs, Predict also active — [Bitcoin Foundation](https://bitcoinfoundation.org/news/prediction-markets/prediction-market-limitless-volume-base/); [TradeInformer](https://tradeinformer.com/newsletter/limitless-predict-opinion-myriad-offshore-prediction-markets-are-already-here).

### Inferences
- The combined private valuation of the two leaders (~$61B if Kalshi closes at $40B) and Kalshi's ~$60B/month notional show the base layer is not a "gap" at all; it is a mature, sports-dominated exchange business. The monetizable frontier has moved to (i) regulated distribution in non-US jurisdictions (UK talks began Oct 6), (ii) exchange infrastructure sold to brokers (Robinhood's multi-exchange routing, DKeX), and (iii) non-sports contract types (Kalshi's Oct 2 oil perpetual filing).
- The Ninth/Sixth vs Third Circuit split means the regulatory moat is unsettled through at least a Supreme Court cert decision; this is the single largest risk to the base layer's US sports revenue, which is the majority of Kalshi's revenue.

### Gaps
- Could not confirm Kalshi's $40B round closing or Polymarket's $21B round closing (both reported as in progress).
- Polymarket US September 2026 volume is contradictory ($8.8B vs $2.8B on the same tracker); The Block's monthly dataset could not be read.
- No company-reported revenue for either firm beyond Kalshi's ">$1.5B annualized" (May 2026); Sacra's $4B (Kalshi) and $1B (Polymarket) are estimates.
- Coinbase's 2026 launch status and any Supreme Court action on NJ's petition were not found.

---

## Key Question 1b: Decision markets / futarchy (MetaDAO, Butter, Seer, Futarchy.fi, enterprise adoption, DMaaS startups)

### Takeaway
Futarchy exists in production only at MetaDAO (Solana), whose ~$2.4M cumulative revenue (Oct 2025–mid 2026) is a fundraising-launchpad fee stream that collapsed from ~$764k/month (Oct 2025) to ~$66.5k (Mar 2026) before a May rebound; Butter's Optimism/Uniswap pilots (2025) missed badly on forecasts, Seer/Kleros ran small experiments in early 2026, and no enterprise adoption or 2026-funded "decision markets as a service" startup was found.

### Cited Findings
- MetaDAO: since the Futarchy AMM went live Oct 10, 2025, ~$2.4M cumulative revenue (~60% Futarchy AMM, ~40% Meteora LP position); DefiLlama shows ~$18M 30-day DEX volume and ~$426k monthly revenue (May 2026 rebound) after decline from ~$764k (Oct 2025) to ~$66.5k (Mar 2026) — [Blockworks](https://blockworks.com/news/rangers-ico-metadao); [Solana Compass](https://solanacompass.com/projects/metadao). Fee rate conflicts: 0.5% (full accrual to MetaDAO since Dec 28, 2025) vs 0.25% in docs with plan to raise to 50 bps — [Blockworks](https://blockworks.com/news/rangers-ico-metadao); [MetaDAO docs](https://docs.metadao.fi/protocol/analytics). Revenue is explicitly dependent on new ICOs flowing through the pipeline — [Alea Research](https://alearesearch.substack.com/p/metadao).
- MetaDAO's permissionless sub-launchpad Futardio drew $43M in commitments but produced only ~$8,700 in revenue from its first batch — [Crypto Briefing](https://cryptobriefing.com/futardio-44m-commitments-metadao-sourcing/). A 2025 valuation model projected $21M launchpad revenue for 2026 (base case), far above actuals — [Deep Waters](https://deepwaters.capital/tpost/aiocd9mup1-metadao-market-considerations-amp-valuat).
- MetaDAO July 2026: the Rip Cars ICO was 127x oversubscribed ($31.9M committed vs $250k cap); Credible Finance (CRED) TGE distributed on Jul 17, 2026; MetaDAO introduced an onchain treasury for post-sale funding and launched "Backable" and a "STAMP" token-as-company model (dates unclear); META migrated to a new contract — [CoinGecko](https://www.coingecko.com/en/coins/meta-2); [Crypto Briefing](https://cryptobriefing.com/metadao-onchain-treasury-post-token-sale/); [CryptoRank](https://cryptorank.io/ico/meta-dao). No Aug–Sep 2026 MetaDAO news was surfaced.
- Butter: first conditional funding markets launched Feb 27, 2025 with Uniswap Foundation and Optimism; Uniswap Foundation granted Butter $200,000; Optimism round allocated 5 x 100k OP; markets closed Jun 12, 2025 with 430 forecasters after filtering 4,122 suspected bots; forecast ~$239M TVL increase vs ~$31M realized — [Uniswap Foundation](https://www.uniswapfoundation.org/blog/futarchy-meets-governance-optimism-and-uniswap-foundation-pilot-cfms); [Optimism gov forum, Futarchy v1 findings](https://gov.optimism.io/t/futarchy-v1-preliminary-findings/10062); [Token Relations](https://tokenrelations.substack.com/p/rethinking-governance-optimism-and). Butter's ggresearch archive was exported Feb 2026; Butter pitched a treasury-allocation mechanism to ZK Nation; its CEO frames Butter as "bringing Information Finance to Ethereum, starting with futarchy" — [GitHub buttermarkets/ggresearch](https://github.com/buttermarkets/ggresearch); [ZK Nation forum](https://forum.zknation.io/t/butter-a-new-treasury-allocation-mechanism/502); [Governance Futures podcast](https://govfutures.podbean.com/e/s1-ep9-futarchy-prediction-markets-the-future-of-daos-%E2%80%94-vaughn-mckenzie-landell-ceo-of-butter/). No 2026 Butter fundraise found.
- Seer (Gnosis, built on Reality.eth + Conditional Tokens) lists "Futarchy Markets" as a market type; Kleros ran "Kleros Foresight" (judge-rated movies) on Seer in early 2026 and said next experiments would be real-estate pricing and futarchy for DAO grant allocation ("If funded, what will this project's TVL/users/revenue be in one year?") — [Seer docs](https://seer-3.gitbook.io/seer-documentation); [Kleros blog](https://blog.kleros.io/kleros-foresight-movie-experiment/).
- A search for a 2026 seed round for any futarchy/decision-market startup returned nothing relevant — [Crunchbase Q3 2026 data](https://news.crunchbase.com/venture/q3-2026-global-startup-funding-ai-billion-dollar-rounds-exits-data/) (context only).

### Inferences
- The only revenue in futarchy is really ICO-launchpad trading fees; "governance by markets" as a service to companies, DAOs or governments has no paying customer base visible in 2026. The Optimism result (forecast off by ~8x) is the main empirical argument buyers will cite against it.
- MetaDAO's STAMP "token-as-company" and Backable (mid-2026) are the closest thing to futarchy-governed corporate entities, but they remain crypto-native fundraising products rather than decision tooling sold to existing organizations.

### Gaps
- Futarchy.fi: no results surfaced at all; status unknown.
- Enterprise adoption: none found; could not verify if any non-crypto company or government piloted decision markets in 2026.
- MetaDAO Aug–Oct 2026 revenue, and the Kleros futarchy grant-allocation results, were not found before the search budget ran out.

---

## Key Question 1c: Prediction-market-native media vs odds-licensing deals

### Takeaway
Odds licensing has become standard (Kalshi with CNN, CNBC, Fox News, AP; Polymarket with Dow Jones, Yahoo Finance, Substack; both with Genius Sports in Aug 2026), but the only prediction-market-native media company is Eventual, a modestly seeded, Polymarket-sponsored twice-weekly video show launched July 28, 2026.

### Cited Findings
- Kalshi deals with CNN (Dec 2025, exclusive, no licence fee paid by CNN), CNBC (multi-year starting 2026, with a "Prediction Hub"), Fox News; AP licences election data to Kalshi (Mar 2, 2026, non-exclusive) — [Axios, Dec 2, 2025](https://www.axios.com/2025/12/02/cnn-kalshi-prediction-market-data); [Axios, Mar 2, 2026](https://www.axios.com/2026/03/02/kalshi-ap-elections-data); [TheWrap](https://www.thewrap.com/media-platforms/journalism/polymarket-kalshi-cnn-cnbc-dow-jones/).
- Polymarket: exclusive Dow Jones partnership announced Jan 7, 2026 (WSJ, Barron's, MarketWatch, IBD modules); exclusive Substack partnership Feb 2026 (20% of Substack's top 250 revenue publications used the features per Substack's CEO); free "Journalism Tools" toolkit Apr 2026 (draft analyzer, market timeline); Yahoo Finance deal — [BusinessWire, Jan 7, 2026](https://www.businesswire.com/news/home/20260107511213/en/Polymarket-and-Dow-Jones-Publisher-of-The-Wall-Street-Journal-Announce-Exclusive-Prediction-Market-Partnership); [Nieman Lab, Feb 2026](https://www.niemanlab.org/2026/02/polymarket-says-journalism-is-better-when-its-backed-by-live-markets-does-anyone-know-what-that-means/); [Bankless](https://www.bankless.com/read/news/polymarket-launches-predictive-toolkit-for-journalists).
- Genius Sports signed separate official sports-data partnerships with Polymarket and Kalshi in Aug 2026 — [iGaming Business](https://igamingbusiness.com/prediction-markets/genius-sports-enters-prediction-markets-polymarket-kalshi-partnerships/).
- Eventual (Jul 28, 2026): founded by Alex Keeney; modest seed round; Polymarket is launch sponsor and exclusive data partner; twice-weekly live video show; revenue plan is ads/sponsorships — [Axios, Jul 28, 2026](https://www.axios.com/2026/07/28/prediction-markets-media-startup-eventual).
- Time partnered with Galactic's Predictor.io (Nov 20, 2025) — [Axios](https://www.axios.com/2025/11/20/time-galactic-prediction-market). "Prediction Market Network" bills itself as "where prediction markets meet editorial journalism" (launch date unconfirmed) — [Prediction Market Network](https://www.predictionmarketnetwork.com/).
- Criticism: Marketing Brew (Apr 20, 2026) on TV programming becoming "one big casino"; New Republic on a "devil's bargain"; CJR on undisclosed sponsored data — [Marketing Brew](https://www.marketingbrew.com/stories/2026/04/20/polymarket-and-kalshi-are-turning-tv-programming-into-one-big-casino); [New Republic](https://newrepublic.com/article/209602/media-ethics-prediction-markets-kalshi-polymarket); [CJR](https://www.cjr.org/tag/prediction-markets).

### Inferences
- The exchanges treat media as a free distribution channel (CNN pays nothing; Polymarket sponsors Eventual), so odds data is being given away rather than sold; the monetizable gap is an independent, subscription- or data-funded newsroom whose reporting moves markets rather than merely displaying them.

### Gaps
- No audience or revenue figures for Eventual or Prediction Market Network were found.
- No evidence of Kalshi building or funding its own media arm.

---

## Key Question 1d: AI agents trading prediction markets; AI-run long-tail micro-markets

### Takeaway
AI trading agents are productized (Olas/Polystrat on Polymarket since Feb 2026; Public's agents on Kalshi since Sep 24, 2026; Kalshi's internal AI for contract wording), but no one has productized AI-generated long-tail micro-markets on arbitrary questions; the closest items are Olas's "market creation" agent in Pearl and Meta's unlaunched, AI-powered Arena.

### Cited Findings
- Polystrat (Olas/Valory) launched on Polymarket Feb 2026; Valory's David Minarsch claims >37% of Polystrat agents are P&L-positive vs less than half that for humans (vendor figure); Pearl ships one agent for prediction markets, one for yield and one for market creation — [CoinDesk, Mar 15, 2026](https://www.coindesk.com/tech/2026/03/15/ai-agents-are-quietly-rewriting-prediction-market-trading); [crypto.news on Pearl](https://crypto.news/pearl-prediction-markets-and-the-long-tail-of-ai-liquidity/).
- Public launched AI Agents for Prediction Markets Sep 24, 2026 (trade events or let agents trade; also use PM data as a signal for stock/bond trades), tied to Kalshi — [Fortune, Sep 24, 2026](https://fortune.com/2026/09/24/public-ai-trading-agents-prediction-markets-kalshi-tie-up/).
- Kalshi built an internal AI agent to fix contract-wording problems (not a public market-creation product) — [PYMNTS](https://www.pymnts.com/economy/markets/2026/kalshi-create-ai-agent-to-smooth-prediction-market-contracts/).
- IOSG expects "prediction market agents" as a 2026 product category but notes HFT/microstructure strategies are liquidity-constrained, so agents will focus on arbitrage and data-driven strategies — [IOSG via KuCoin](https://www.kucoin.com/news/flash/iosg-prediction-market-agents-to-emerge-as-new-product-form-in-2026); [PANews](https://panews.io/articles/019cb304-24a5-71ce-9864-8be61e003130).
- Columbia/IBM arXiv paper (Dec 2025) on agentic cross-market structure discovery evaluated on early-2026 data — [arXiv 2512.02436](https://arxiv.org/pdf/2512.02436).
- Limitless offers scoped API tokens and developer endpoints for automated trading; Myriad is "media-native" with agent integrations; Opinion Labs makes AI-oracle claims that a reviewer says need checking — [Bitcoin Foundation](https://bitcoinfoundation.org/news/opinion/best-prediction-markets-2026/); [PredictionHunt](https://www.predictionhunt.com/blog/best-crypto-prediction-markets-2026).
- No source found describing a platform where AI agents create markets on any question — searches returned only trading agents (see above).

### Inferences
- The "long tail" that Vitalik argued AI would unlock (cheap market creation + AI participants making tiny markets viable) is still unbuilt as a product; the parts exist separately (Olas market-creation agent, Limitless APIs, Kalshi's wording AI) but nobody sells "spin up a micro-market on anything and have agents price it."

### Gaps
- No independent audit of agent P&L on long-tail markets exists; the Olas numbers are vendor-reported.
- Could not verify what Olas's "market creation" agent actually creates or its volumes.

---

## Key Question 1e: Vitalik's 2026 commentary on prediction markets drifting to gambling

### Takeaway
On Feb 14, 2026 Vitalik (a Polymarket investor) warned that prediction markets are "over-converging" on short-term crypto price bets and sports, calling reliance on "naive traders" with "dumb opinions" "cursed" and the trajectory "corposlop," and proposed hedger-centric personalized expense-index baskets built by personal AI assistants that could eventually replace stablecoins/fiat; no later 2026 statement surfaced.

### Cited Findings
- Feb 14–15, 2026 X post: markets have grown large enough to support full-time traders but drift toward short-term crypto price bets and sports; "nothing fundamentally morally wrong with taking money from people with dumb opinions, but there still is something fundamentally 'cursed' about relying on this too much"; risk of collapse in bear markets — [The Block, Feb 15, 2026](https://www.theblock.co/news/ecosystems/2026-02-15-polymarket-investor-vitalik-buterin-says-prediction-markets-need-to-stop-catering-to-dumb-opinions-389984); [Finance Magnates](https://www.financemagnates.com/trending/vitalik-buterin-changes-stance-on-prediction-markets-warns-of-cursed-slide-into-corposlop/); [BeInCrypto](https://beincrypto.com/vitalik-buterin-prediction-markets-warning/).
- Proposed alternative: regional price indices for food, housing, transportation; a personal AI assistant builds a tailored portfolio of positions representing expected future expenses; hold ETH/stocks for growth and personalized PM shares for stability; could replace stablecoins and fiat — [Decrypt](https://decrypt.co/358165/vitalik-buterin-hedging-on-prediction-markets-could-replace-fiat-currency); [Yellow](https://yellow.com/news/vitalik-buterin-proposes-prediction-markets-as-alternative-to-stablecoins-and-fiat).
- This is a shift from December 2025, when he called PM participation "healthier" than traditional markets — [Gizmodo](https://gizmodo.com/ethereum-creator-starting-to-think-this-whole-prediction-market-thing-might-be-gambling-2000722910).
- Searches for Aug–Sep 2026 commentary returned only the February post — [Stocktwits](https://stocktwits.com/news-articles/markets/cryptocurrency/vitalik-buterin-wants-prediction-markets-to-replace-fiat-not-fuel-gambling/cZRJHlsR4tr).

### Inferences
- Vitalik has effectively specified the next product himself: a hedging-first, AI-constructed basket of personalized cost-of-living exposures. Nothing in the searches shows any exchange or startup building it; Kalshi's Oct 2, 2026 oil-perpetual filing is the nearest move toward hedging-type contracts.

### Gaps
- Could not search Vitalik's blog/X for June–October 2026 posts (search budget exhausted); any later commentary is unverified.

---

## Key Question 2a: MACI / Privacy Stewards of Ethereum adoption

### Takeaway
PSE (launched Sep 13, 2025) and Shutter published a "State of Private Voting 2026" report that ranks MACI v3 at high implementation maturity but flags its trusted coordinator and complexity; Vitalik in May 2026 pointed to Interfold (threshold encryption + ZK + FHE) as bringing MACI-style voting closer; no 2026 production DAO deployments were identified in the snippets.

### Cited Findings
- State of Private Voting 2026 (PSE + Shutter) introduces an evaluation framework; MACI v3 is listed under high implementation maturity; weaknesses: trusted coordinator who can see individual ballots, and complexity; one table entry shows "Testnet: No / Mainnet: No" (unclear whether for MACI) — [PSE PDF](https://pse.dev/articles/state-of-private-voting-2026/state-of-private-voting-2026-v2.pdf); [Shutter blog](https://blog.shutter.network/state-of-private-voting-2026/).
- PSE rebranded from Privacy & Scaling Explorations to Privacy Stewards of Ethereum on Sep 13, 2025 — [Brave New Coin](https://bravenewcoin.com/insights/ethereum-foundation-launches-privacy-stewards-initiative-with-ambitious-roadmap).
- Vitalik (May 2026) said Interfold brings MACI-style private voting closer to Ethereum — [CryptoAdventure](https://cryptoadventure.com/vitalik-says-interfold-brings-maci-style-private-voting-closer-to-ethereum/).
- MACI remains listed on ethereum.org developer tools; repo moved to privacy-ethereum/maci — [ethereum.org](https://ethereum.org/developers/tools/maci/); [GitHub](https://github.com/privacy-ethereum/maci/discussions/859).

### Inferences
- MACI is mature as research infrastructure but not productized; the coordinator trust assumption is what every competing design (Interfold, DAVINCI, Shutter) is attacking.

### Gaps
- No count of DAOs/rounds using MACI in 2026 was found; the full PDF could not be fetched.

---

## Key Question 2b: Vocdoni DAVINCI — did the July 2026 mainnet/TGE happen?

### Takeaway
No evidence the July 2026 mainnet launch or VOC TGE happened; instead, Vocdoni rewrote the sequencer in Rust (davinci-sequencer v0.1.0 released late September 2026, v0.2.1/v0.2.2 on Sep 29, SDK 2.0.0 on Oct 1) running live elections on Gnosis Chain, with the IACR paper (2026) still describing the decentralized sequencer network as future work.

### Cited Findings
- Roadmap (Apr 2025 blog): June 2025 public testnet + token presale start; July 2026 expected mainnet launch and TGE; Q4 2026 migration of Vocdoni organizations — [Vocdoni blog](https://blog.vocdoni.io/davinci-universal-voting-protocol/). davinci.vote says Q3 2026 migration target and "launching in 2026" — [davinci.vote](https://davinci.vote/).
- Funding: $1M angel round (Apr 2025) — [Dealroom](https://app.dealroom.co/news/feed/vocdoni-raises-1m-for-davinci-launch).
- davinci-sequencer (Rust, on davinci-zkvm) replaces davinci-node (Go/gnark): v0.1.0 first release with explorer, Gnosis default; v0.2.1 (Sep 29, 2026) fixes from running live on Gnosis "with many elections and two racing nodes"; v0.2.2 (Sep 29) RPC fixes; PR #3 batching/grace window (Sep 29); PR #4 nonce handling (Sep 30); README flags an unfixed scalar bias in re-encryption — [GitHub davinci-sequencer](https://github.com/vocdoni/davinci-sequencer); [v0.2.1](https://github.com/vocdoni/davinci-sequencer/releases/tag/v0.2.1); [v0.2.2](https://github.com/vocdoni/davinci-sequencer/releases/tag/v0.2.2). davinci-sdk 2.0.0 (Oct 1, 2026) routes voters to nodes with failover — [davinci-sdk PR #90](https://github.com/vocdoni/davinci-sdk/pull/90). davinci-contracts latest release May 26, 2026, still labelled work-in-progress — [GitHub davinci-contracts](https://github.com/vocdoni/davinci-contracts).
- IACR ePrint 2026/2282 describes DAVINCI as E2E-verifiable with no trusted coordinator; decentralized sequencer network appears to be future work — [IACR](https://eprint.iacr.org/2026/2282.pdf).
- Real usage: Jun 9, 2026 case study with Universitat Politècnica de Catalunya, students voting with university ID without downloading anything; partnership to validate DAVINCI — [Vocdoni blog](https://blog.vocdoni.io/davinci/).
- VOC token design: organizers pay to launch elections; sequencers stake VOC; voting free — [HackMD](https://hackmd.io/@vocdoni/BJY8EXQy1x).

### Inferences
- The July 2026 mainnet/TGE milestone slipped; the project is in a late-September 2026 re-architecture on Gnosis rather than a token launch. Commercial traction is one university pilot.

### Gaps
- No official statement on the delay, presale amounts raised, or a new TGE date was found; the Vocdoni blog could not be fetched.

---

## Key Question 2c: Government / union / shareholder adoption of cryptographic voting in 2026

### Takeaway
No 2026 government, union, or shareholder deployment of zk/cryptographic voting was found; the only 2026 real-world pilot surfaced is Vocdoni's UPC student election, and Rarimo's Freedom Tool deployments (Russia opposition, Iranians Vote) date from 2024.

### Cited Findings
- 2026 explainer: no major country uses blockchain for national elections as of 2026; past pilots were US overseas-military voting, Estonia local referendums, small Swiss cantonal trials (zk use unverified) — [FTFA-SAO](https://ftfa-sao.org/real-world-blockchain-voting-implementations-case-studies-risks-and-2026-status).
- Freedom Tool (Rarimo, Feb 2024): passport-NFC eligibility, zk-severed link, votes onchain; used by Russian opposition app and Iranians Vote; no 2026 election use found — [Blockworks](https://blockworks.com/news/decentralizing-social-identity-zk-voting); [PR Newswire](https://www.prnewswire.com/news-releases/beyond-state-control-citizen-run-elections-enabled-by-the-release-of-rarimos-freedom-tool-302061741.html); [ethereum.org apps](https://ethereum.org/apps/freedom-tool).
- Academic: zkVoting coercion-resistant design (2.3s ballot proof on phone) — [IACR 2024/1003](https://eprint.iacr.org/2024/1003.pdf); Feb 2026 systematic review says academic contexts are where pilots are most feasible — [ResearchGate](https://www.researchgate.net/publication/388799838_Zero_Knowledge_Proof_on_Top_of_Blockchain_for_Anonymous_and_Verifiable_E-Voting_System).
- UPC pilot (Jun 9, 2026) — [Vocdoni blog](https://blog.vocdoni.io/davinci/).

### Inferences
- Shareholder/proxy voting is the most plausible paying market and nothing was found there; this is a wholly open commercial gap.

### Gaps
- No search of proxy-industry (Broadridge etc.) or union-election news was possible before the budget ran out.

---

## Key Question 2d: Gitcoin status and GG25

### Takeaway
Gitcoin is contracting: Grants Stack and Grants Lab were sunset May 2025; GG24 (Oct 14–28, 2025) distributed ~$1.8M ($1.175M Gitcoin + $632.5K partners) across six domains; a March 2026 proposal would replace big rounds with a yearlong d/acc campaign; GG25 is listed as "upcoming" with no confirmed dates or pool; and founder Kevin Owocki is spinning out "Techne," a non-profit local-community-tools brand targeting a mid-December 2026 launch with no token.

### Cited Findings
- GG24: inaugural "Gitcoin 3.0" plural-mechanism round, QF Oct 14–28, 2025; ~$1.8M across six domains ($1.175M from Gitcoin, $632.5K external) — [Gitcoin case study](https://gitcoin.co/case-studies/gg24-first-funding-round-of-gitcoin-3-0); [Giveth GG24 results](https://news.giveth.io/givnews46).
- GG25: withdrawn Octant yield-matching proposal targeted Q2 2026 with $100k–$300k pool (Octant had offered to match up to $2M) — [Gitcoin gov forum](https://gov.gitcoin.co/t/withdrawn-gitcoin-x-octant-yield-powered-matching-for-gg25/24977). Gitcoin's homepage lists GG25 as upcoming with no details — [gitcoin.co](https://gitcoin.co/). A third-party tracker said as of Aug 29, 2026 no next round had been announced — [AI Jobs Desk](https://aijobsdesk.com/funding/gitcoin-grants).
- March 2026 proposal (Mathilda DV) to sunset 1–2x/year rounds for a yearlong d/acc campaign with monthly sub-campaigns, go-live target May 2026; adoption status unconfirmed — [Gitcoin gov forum](https://gov.gitcoin.co/t/proposal-gitcoin-d-acc-2026-funding-initiative-restructuring-the-grants-program/25157).
- Techne spin-off: separate brand, non-profit, possibly seeded by Gitcoin treasury, no new token, pilots Beacon (local events app) and Buoy (local currency with QF as a feature), SDK/AI tools delayed to 2027; GTC reportedly surged 150% on the news (single secondary source) — [Phemex](https://phemex.com/news/article/gitcoin-rebrands-as-techne-with-december-launch-target-gtc-surges-150-despite-no-new-token-plans-99136).
- Grants Stack and Grants Lab sunset by May 27, 2025; QF now runs on Giveth and other platforms — [Gitcoin blog](https://gitcoin.co/blog/grants-stack-winds-down--heres-whats-changing-and-what-to-expect); [The Block](https://www.theblock.co/post/352055/ethereum-public-goods-funding-protocol-gitcoin-winding-down-its-software-division).

### Inferences
- Quadratic funding as a product has no business model at Gitcoin; the Techne pivot to local community tools is an admission that crypto-native QF rounds did not become a durable commercial line.

### Gaps
- GG25 dates, pool and mechanism are unconfirmed; Techne details rest on one secondary source.

---

## Key Question 2e: Deep Funding rounds in 2026 and commercialization

### Takeaway
Deep Funding remains an experiment: the first round was a $250k Vitalik-sponsored Kaggle contest on Ethereum's ~40,000-edge dependency graph; the only subsequent round is GG24's $350k Dev Tooling/Web3 Infra allocation, which as of its last forum update had ~500 evaluations from 50 evaluators and only $1,500 of model-builder trades and will not finalize until GG25 concludes; no commercialization or 2026 standalone round was found.

### Cited Findings
- Mechanism: value-as-a-graph plus "distilled human judgement" (open market of AIs fills weights; human jury spot-checks) — [Vitalik on X, Dec 2024](https://x.com/VitalikButerin/status/1867886974058520820); [Gitcoin mechanism page](https://gitcoin.co/mechanisms/deep-funding).
- First round: $250k ($170k to repos by model weights, $40k to best model vs jury, $40k open-source models); ~40,000 edges; hundreds of Kaggle submissions within two weeks — [Gitcoin visual guide](https://gitcoin.co/research/deep-funding-visual-guide); [PANews](https://panewslab.com/en/articledetails/d19fc7vl.html).
- GG24 Deep Funding round: $350,000 approved; operators Devansh Mehta, Clement Lesaege, Allan Niemerg; ~500 evaluations / 50 evaluators / $1,500 in trades; ends when GG25 concludes — [Gitcoin gov forum](https://gov.gitcoin.co/t/deep-funding-gg24-web3-tooling-and-infra-round/25040); [model submissions thread](https://gov.gitcoin.co/t/model-submissions-gg24-deep-funding/25151?page=3).
- Gitcoin: "Deep Funding has completed only its initial rounds as of early 2026" and remains unproven at scale — [Gitcoin](https://gitcoin.co/mechanisms/deep-funding).
- Vitalik's 2026 projection (GreenPill podcast): deep funding running live month-to-month by 2026 with ENS and Lido instances — a projection, not a result — [GreenPill S10E6 summary](https://www.podtldr.fm/tldr/greenpill-s-10-ep-6-public-goods-funding-in-2026-what-builders-should).
- Unrelated namesakes: SingularityNET's "Deep Funding" ($1M+ to 16 winners, Feb 2025) and deepfunding.ai — [Tracxn](https://tracxn.com/d/companies/deep-funding/__xyjoJYT4KAsgBqST_OfgT5VwMzpoKC1Mlb_h5er_VHQ).

### Inferences
- $1,500 of market trades against a $350k pool indicates the "market of AI models" leg has almost no participation; the mechanism is far from the monthly, multi-ecosystem operation Vitalik projected.

### Gaps
- deepfunding.org itself could not be fetched; whether ENS/Lido instances exist is unverified.

---

## Key Question 2f: "AI as engine, humans as steering wheel" — distilled human judgment, sortition juries steering AI; startups?

### Takeaway
No funded startup was found; the space is occupied by nonprofits (Collective Intelligence Project's Alignment Assemblies, FLI-recommended $150k grant), academic citizen-jury pilots (Brussels COOMEP, 20 sortition-selected participants, ~6 months), and 2026 papers (sortition-weighted RLHF).

### Cited Findings
- CIP: 501(c)(3); Alignment Assemblies since 2023 with no developer funding; research fellowship pilot ($9,000 stipend, deadline May 15, 2026); FLI recommended $150k grant — [CIP](https://www.cip.org/blog/alignment-assemblies-nine-months-in); [CIP fellowship](https://www.cip.org/research-fellowship); [FLI](https://futureoflife.org/grant/collective-intelligence-project/).
- Brussels citizen jury on AI energy distribution (COOMEP, VUB): 20 participants selected by sortition from 100+ — [FARI Institute](https://www.fari.brussels/news-and-media-article/ana-pop-stefanija-a-citizen-jury-for-socially-acceptable-ai-systems).
- June 2026 Cambridge Forum on AI paper finds volunteer self-selection undercuts sortition representativeness — [Cambridge](https://www.cambridge.org/core/journals/cambridge-forum-on-ai-culture-and-society/article/deliberating-the-algorithmic-future-reconfiguring-ai-ethics-through-citizen-juries/5855951D7BBAA402825B1292CD8F1745).
- "Democratic Preference Alignment via Sortition-Weighted RLHF" (arXiv, Feb 2026) — [arXiv 2602.05113](https://arxiv.org/pdf/2602.05113).
- UK AISI Alignment Project: £27M first round to 60+ projects; second round expected summer 2026 (CIP not named) — [AISI](https://www.aisi.gov.uk/blog/funding-60-projects-to-advance-ai-alignment-research).

### Inferences
- The only production instance of "distilled human judgment" is Deep Funding's jury spot-check, and it has near-zero market participation. A commercial "human jury as oracle for AI decisions" product does not exist.

### Gaps
- Could not search for specific companies (e.g., Remesh, Pol.is commercial forks) before budget exhaustion.

---

## Key Question 3: Credibly-neutral content ranking / Community Notes beyond X; bridging as a product/API; prediction-market content ranking

### Takeaway
Community Notes has spread (Meta: >1.4M US contributors and >50,000 notes, Latin America test in 16 countries from Sep 2026 over Oversight Board and IFCN objections; TikTok Footnotes ~80,000 contributors by mid-2025; YouTube since Aug 2024), and X opened an AI Note Writer API (first AI writer admitted Sep 2, 2025; one AI client now produces 52% of Helpful notes), but there is no cross-platform bridging API or startup, Jigsaw is sunsetting Perspective API after 2026, and prediction-market-based content ranking exists only as a 2017 ethresear.ch concept.

### Cited Findings
- Meta: US contributors >1.4M producing >50,000 notes across Facebook/Instagram/Threads (vs ~70,000 contributors and 15,000 notes a year earlier; earlier publication rate ~6%) — [Botnet summary](https://botnet.com/resources/board-community-notes-what-changed); Latin America pilot in 16 countries from Sep 2026, fact-checking kept temporarily — [Social Media Today](https://www.socialmediatoday.com/news/meta-expands-community-notes-to-latin-america/830128/); [Malay Mail, Sep 10, 2026](https://www.malaymail.com/news/tech-gadgets/2026/09/10/meta-pilots-community-notes-in-16-latin-american-countries-signalling-shift-from-professional-factchecking/234641). Oversight Board (Mar and Sep 2026) and IFCN oppose — [TechXplore, Sep 2026](https://techxplore.com/news/2026-09-oversight-board-meta-fact-community.html); [Poynter/IFCN](https://www.poynter.org/fact-checking/2026/declaracion-de-la-red-internacional-de-verificacion-de-hechos-sobre-la-expansion-de-las-notas-de-la-comunidad-de-meta-a-america-latina/). Meta runs notes on X's open-source algorithm — [Botnet](https://botnet.com/resources/board-community-notes-what-changed).
- TikTok Footnotes: US pilot, ~80,000 approved contributors by mid-2025; notes do not affect ranking; no 2026 expansion found — [Engadget](https://www.engadget.com/social-media/tiktoks-community-notes-era-starts-today-110041152.html); [Social Media Today](https://www.socialmediatoday.com/news/tiktok-launches-community-notes-footnotes-in-the-us/756370/).
- YouTube: first video platform to add notes (Aug 2024); no 2026 status found — [Wikipedia](https://en.wikipedia.org/wiki/Community_Notes).
- X AI Note Writer API: open since Sep 2025; largest client ("Community Writer") = 52% of Helpful notes; 42% of posts with Helpful notes have only AI notes vs 30% only human; April 2026: AI writers contributed to 50% more Helpful English notes in one week; Feb 2026 "Collaborative Notes" test with Grok drafting — [arXiv 2609.40067, Sep 2026](https://arxiv.org/abs/2609.40067); [Dataconomy, Feb 6, 2026](https://dataconomy.com/2026/02/06/x-tests-collaborative-ai-notes-for-community-notes-feature/); [Botnet](https://botnet.com/resources/board-community-notes-what-changed).
- Jigsaw: experimental bridging attributes (affinity, compassion, curiosity, nuance, personal story, reasoning, respect) in Perspective API; Jigsaw announced in Jan 2026 it is sunsetting Perspective API with service ending after 2026 — [Jigsaw Medium](https://medium.com/jigsaw/announcing-experimental-bridging-attributes-in-perspective-api-578a9d59ac37); [Wikipedia (Jigsaw)](https://en.wikipedia.org/wiki/Jigsaw_(company)). Prosocial Ranking Challenge (arXiv, Mar 2026) tested bridging-attribute reranking, partly funded by Jigsaw — [arXiv 2603.19626](https://arxiv.org/html/2603.19626).
- Research on sustainability/consensus stability of X Community Notes (Oct 2025, Jan 2026) — [arXiv 2510.00650](https://arxiv.org/html/2510.00650v1); [arXiv 2601.14002](https://arxiv.org/html/2601.14002).
- Prediction-market content curation: only an ~8-year-old ethresear.ch design (each post is its own market on moderator approval) — [ethresear.ch](https://ethresear.ch/t/prediction-markets-for-content-curation-daos/1312). No 2026 deployment found.
- Representative/bridging ranking as public-sphere infrastructure: Knight First Amendment Institute essay — [Knight Columbia](https://knightcolumbia.org/content/representative-ranking-for-deliberation-in-the-public-sphere).

### Inferences
- Bridging is spreading as a platform-internal feature copied from X's open-source code, not as a product; with Perspective API ending after 2026, the only commercially available bridging classifier is disappearing, which opens (and has not filled) the "bridging-as-API" slot Vitalik described.
- The AI Note Writer API is the one real "AI engine, human steering wheel" system in production at scale (AI drafts, human raters decide), and it is X-only.

### Gaps
- Meta's 2026 note-publication rate, YouTube's 2026 status, and TikTok's 2026 footprint were not found.
- No startup selling cross-platform notes or bridging ranking surfaced in any query.
