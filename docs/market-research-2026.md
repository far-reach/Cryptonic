# State of the Art: Cryptocurrencies, Ethereum & Solana — July 2026

Synthesis of a multi-source web research sweep (5 parallel research tracks, ~80 sources,
conducted 2026-07-11). Figures are best-supported values; conflicts between sources are
flagged inline. Source links are collected at the end of each section.

---

## 1. Macro market state

- **Total crypto market cap ~$2.28T**, down from the ~$4.27T all-time high of October 2025.
  Rough prices: BTC ~$64k, ETH ~$1,700–1,800, SOL ~$75–82. BTC dominance ~56%.
- **Regime: bear market.** The Oct 10, 2025 liquidation cascade (~$20B wiped), fading ETF
  demand, macro tightening and the 2026 Iran/Hormuz crisis drove BTC ~53% off its ATH at the
  June 2026 low. Pantera notes altcoins have effectively been in a bear market since late 2024.
- **ETF flows:** Bitcoin ETFs saw ~$8B of net outflows May–June 2026 (2026 YTD flows negative
  for the first time). Solana spot ETFs (live since Oct 28, 2025, **with staking**) kept
  attracting inflows every July trading day (~$1.1B AUM) despite weak price.
- **The BTC treasury-company (DAT) model broke:** Strategy's mNAV fell below 1.0 (June 27,
  2026) and Saylor filed to sell up to $1.25B of BTC — the first-ever sale.
- **Regulation:** GENIUS Act (stablecoins) signed July 2025, implementing rules due July 18,
  2026. CLARITY Act (market structure) passed Senate Banking 15–9 but missed the July 4 floor
  target. SEC "Project Crypto" innovation exemption lets eligible firms issue/trade tokenized
  securities without full registration. EU MiCA transitional period ended July 1, 2026 —
  only ~244 firms authorized; a "MiCA 2.0" rethink is underway.

**What users actually pay for on-chain (annualized revenue, 2026):** Tether ~$5.4B, Tron
~$3.0B, Circle ~$2.5B, Hyperliquid ~$924M (crossed **$1B cumulative revenue** June 30, 2026),
pump.fun ~$300M and falling, Polymarket ~$0.7M/day. Revenue concentrates in **stablecoins,
perps, prediction markets** — not in general-purpose blockspace.

Sources: coinmarketcap.com, kucoin.com/news (bear-market timeline), coindesk.com (Pantera,
Strategy mNAV), cnbc.com (CLARITY), coindesk.com/policy (MiCA), ccn.com + panopticprotocol.com
(protocol revenue), fool.com (Hyperliquid $1B), helius.dev (SOL ETFs).

---

## 2. Ethereum ecosystem

**Protocol.** Fusaka shipped Dec 3, 2025 with **PeerDAS (EIP-7594)** (~8x rollup data
throughput at launch); BPO forks then tripled blob capacity (target/max 6/9 → 14/21 by Jan
2026). Fusaka also shipped **EIP-7951** (secp256r1 precompile → native passkey signing) and
EIP-7918 (blob fee floor — blobs now contribute real burn). Next: **Glamsterdam** (enshrined
PBS via EIP-7732 + Block-Level Access Lists; slipped to ~Q3 2026), then **Hegotá**
(statelessness/FOCIL). Verkle trees were effectively abandoned in favor of zk-friendly
approaches. **Real-time zkEVM proving of L1 blocks was achieved** (most blocks provable in
<10–12s; ~45x cost reduction; "Lean Ethereum" targets 10k+ TPS L1 + quantum resistance).
Vitalik publicly declared the pure rollup-centric roadmap "no longer makes sense" — L1 is
scaling itself again.

**L2s.** ~73 active rollups but a two-tier market: Arbitrum (~$17B TVL) + Base (~$13B) ≈ 77%
of L2 DeFi; Base leads activity (~380k DAU). Post-Fusaka L2 fees < $0.02. Consensus: most
general-purpose L2s are "zombie chains" that won't survive 2026. Native rollups (EIP-8079
EXECUTE precompile) were prototyped March 2026. Fragmentation is still THE UX problem;
ERC-7683 cross-chain intents hit production (88% of Across volume) with the Open Intents
Framework backed by 30+ teams.

**Restaking.** EigenLayer (now "EigenCloud") holds ~94% share (~4.6M ETH restaked), slashing
live since April 2025 — but tracked AVS revenue is only ~$5.3M/month against billions in
restaked capital. Hype did not deliver revenue; pivot to "verifiable cloud" (AI verification,
DA, oracles).

**Account abstraction.** ~1.07B UserOperations, ~57M smart accounts cumulative. EIP-7702
(live since Pectra) is now the dominant wallet pattern (MetaMask, Rabby, Trust); passkey
signing became cheap on L1 via EIP-7951. Bundler market concentrated (Pimlico+Alchemy ~65%).

**MEV.** Severe builder concentration (~92% of MEV-Boost blocks from 3 builders; Titan ~52%).
ePBS (Glamsterdam) and FOCIL (Hegotá) are the in-protocol fixes; **encrypted mempools** went
live out-of-protocol (Shutter+Primev, Dec 2025) and EIP-8105 proposes in-protocol encryption.
EF leadership has named "MEV elimination" and default privacy as execution priorities.

**ETH the asset.** ~$1,700; ETF flows choppy-to-negative in Q2 2026; ~30–33% of supply staked
(~2.8–3.5% APR). The defining debate is **value accrual**: L1 fees are single-digit $M/day and
L2s "pay pennies for security worth billions"; the ultrasound-money thesis is dimmed until fee
metrics flip.

Sources: blog.ethereum.org (Fusaka, checkpoints), ethereum.org/roadmap, eips.ethereum.org
(EIP-8079), l2beat/medium, blockeden.xyz, spotedcrypto.com, blog.thirdweb.com (AA stats),
arxiv.org/html/2605.04471 (builder concentration), blog.shutter.network, blog.succinct.xyz
(real-time proving), yellow.com/research (L2 fee competition), coindesk.com (Vitalik).

---

## 3. Solana ecosystem

**Protocol.** **Firedancer went live on mainnet Dec 12, 2025**; Firedancer+Frankendancer run
~11–21% of stake (sources conflict; validator-count share higher), ending the Agave
monoculture. **Alpenglow** (SIMD-0326, ~99.6% governance approval) replaces TowerBFT/PoH
voting with Votor/Rotor targeting **~150ms finality** — live on test cluster since May 2026,
mainnet possible Q3–Q4 2026. 16+ months without a major outage; the Oct 2025 crash was
absorbed at ~100k tx-packets/sec with median fees ~$0.007. SIMD-0096 gives 100% of priority
fees to validators; true protocol-level local fee markets remain unbuilt.

**Token extensions & privacy.** Token-2022 is in production (transfer hooks, metadata,
transfer fees). **Confidential Balances** (April 2025) bring ZK-encrypted amounts with
auditor keys — and in March 2026 the Solana Foundation launched an institution-facing
privacy framework explicitly positioned as "confidentiality, not anonymity." Known gap:
transfer hooks and confidential transfers don't compose; adoption metrics are still thin.
ZK Compression (Light Protocol v2) gives up to ~5,200x state-cost reductions.

**Ecosystem.** DeFi TVL ~$5.5B USD but an **all-time high of 80M SOL in SOL terms** — the
"Q1 2026 paradox": on-chain metrics at ATH while USD price crashed ~57%. Weekly DEX volume
(~$11.5B) exceeds Ethereum's. Jupiter is the aggregate giant (Lend $0.9–2B TVL, JupSOL,
Perps). **pump.fun collapsed**: volume −94% from peak, graduation rate 0.26%, PUMP below
launch price despite burning 36% of supply — memecoin infrastructure is a confirmed dead zone.

**Payments.** Stablecoin supply on Solana ~$14.6B; **USDC transfer volume on Solana passed
Ethereum (Dec 2025) and stayed ahead** (~$650B adjusted transfers in Feb 2026, highest of any
chain). Visa settles USDC on Solana rails; Meta quietly rolled out USDC payments (Polygon +
Solana) in April 2026; Shopify settles USDC via Solana Pay.

**DePIN.** Sector revenue is real but small (~$2.6–2.9M/month across Solana DePIN). Helium
is the standout: $2.5M monthly revenue, ~2.9M subscribers, and **57% of revenue from
T-Mobile/AT&T carrier-offload fees** — genuine non-token demand. Hivemapper's on-Solana
revenue is weak (~$47–75k/mo) though enterprise ARR claims are higher; Render/io.net GPU
demand is growing (8M+ weekly committed GPU-hours after a May 2026 enterprise deal).

**SOL the asset.** ~$75–82, market cap ~$43B; spot ETFs live since Oct 2025 **with staking**
(BSOL ~$0.9B inflows, >7% target yield); institutions accumulating against a weak tape.

Sources: coindesk.com/tech (Alpenglow), blockeden.xyz (Firedancer stake), helius.dev,
defillama.com, everstake.one (USDC volumes), fortune.com (Meta), solanafloor.com +
blog.syndica.io (DePIN revenue), theblock.co (Confidential Balances), coindesk.com
(pump.fun burn).

---

## 4. Cross-cutting trends

**Stablecoins — the clearest PMF in crypto.** ~$290B supply (peak ~$315–322B), Q1 2026
volume ~$28T (+51% QoQ). Banks entered: JPMorgan JPMD on Base, SoFi's sofiUSD, a
JPM/BofA/Citi/Wells shared Tokenized Deposit Network targeting 2027. Dedicated stablecoin
chains launched and got traction: **Plasma** (zero-fee USDT; ~$1.8–2B TVL, 800k+ daily txs,
"Plasma One" neobank) and **Stable** (USDT-as-gas). **Tempo** (Stripe+Paradigm, mainnet
March 18, 2026) ships a Machine Payments Protocol for AI agents with Visa, Deutsche Bank,
OpenAI and Anthropic as design partners. Cross-border stablecoin rails cost ~1–2% vs 6.4%
World Bank average. Open regulatory issue: **yield to holders** (GENIUS rulemaking).

**RWA tokenization.** ~$31–33.5B on-chain (ex-stablecoins), >400% growth since early 2025.
Tokenized Treasuries ~$14.8B (BUIDL ~$2.5–3B, Franklin BENJI on 8 chains, Ondo USDY >$1B).
Private credit ~$8B+ (Apollo ACRED on 6 chains). Tokenized equities small but fastest-growing
(~$1.8B mcap claim vs ~$300M AUM per rwa.xyz — definitions differ); xStocks did $10B+ volume
in months. SEC innovation exemption is the accelerant.

**AI × crypto.** The 2025 agent-token mania collapsed (−67% sector-wide; ai16z/ElizaOS −99%
plus fraud litigation; Virtuals revenue −85%). What survived and grew is **agent-payment
infrastructure**: x402 (169M transactions, ~590k buyers, but only ~$50M lifetime volume —
infrastructure ahead of demand), Google AP2 (60+ orgs), Circle's Agent Stack (gasless USDC
nanopayments to $0.000001), x402 Foundation under the Linux Foundation with AWS, Cloudflare,
Google, Visa, Circle and Anthropic. Decentralized compute has modest real revenue (Bittensor
~$43M/quarter; Render/Akash/io.net growing on AI inference demand). Story Protocol pivoted
entirely to AI training-data provenance (The DATA Foundation).

**Privacy — the breakout narrative of the cycle.** ZEC +~800% in 2025 (~$540–640 mid-2026);
**shielded pool grew from 8% to ~30% of ZEC supply**; Grayscale filed the first US
privacy-coin ETF. Ethereum: Aztec mainnet live (Stage-2 rollup at full launch), Railgun
(~$4B cumulative private transfers) and Privacy Pools endorsed by Vitalik and integrated
into EF's Kohaku wallet toolkit; encrypted-mempool coalition pushing protocol-level
encryption. Solana: Confidential Balances + institutional privacy framework. Legal climate
mixed: Tornado Cash delisted (March 2025) but Roman Storm convicted on one count with a
retrial proposed for Oct 2026; CARF/DAC8 tax transparency live in 48+ countries. The
regulated-privacy design space ("confidentiality, not anonymity", proof-of-innocence) is
where institutions and the EF converged.

**ZK proving is now cheap and real-time.** SP1 Hypercube proves 99.7% of Ethereum blocks in
<12s on 16 consumer GPUs; average proof cost ~3.5 cents (>10x cheaper in a year); ~$100k
builds a real-time prover cluster. a16z: ~10,000x-overhead zkVMs → proofs on phones,
verifiable cloud compute.

**Prediction markets broke out.** Kalshi+Polymarket monthly volume <$5B (Sept 2025) →
**$44.8B (June 2026**, World Cup-boosted; ~$20–25B baseline); Polymarket earns ~$729k/day.

**Interoperability.** LayerZero/Wormhole/Axelar/CCIP consolidating (Circle acquired Axelar's
core dev team, Dec 2025); Delphi predicts 60% of interop protocols disappear by 2027.
Intent-based bridging (ERC-7683) is displacing lock-and-mint. No core-protocol compromise of
the big four messengers recently — losses came from integrator misconfigurations (Kelp DAO
~$290M).

Sources: stablecoin.com, bvp.com, coindesk.com (bank network, Tempo, Circle/Axelar),
rwa.xyz, a16zcrypto.com (Big Ideas 2026), messari.io (Theses 2026), panteracapital.com,
chainalysis.com (x402), blog.succinct.xyz, crypto.news (Zcash shielded pool), theblock.co
(Kalshi/Polymarket, Aztec), blog.shutter.network.

---

## 5. Dead zones (do not build here)

| Category | Evidence |
|---|---|
| Memecoin launchpads | pump.fun revenue −80% from peak; 0.26% graduation rate; 98.6% rug rate; PUMP below launch despite 36% supply burn |
| Generic L1s at VC valuations | Berachain TVL −88%, BERA −90%; Monad −35%+; MegaETH −78% from ATH despite working tech |
| Generic-purpose L2s | Base+Arbitrum+OP = ~90% of L2 txs; "zombie chains"; 21Shares says most won't survive 2026 |
| NFT platforms | 2025 volume −37% YoY (~95% off peak), H1 2026 down another 50% |
| BTC treasury companies | Strategy mNAV < 1.0; flywheel requires premium; copycats at discounts |
| High-FDV/low-float VC token launches | Explicitly out of favor; Hyperliquid's no-VC, revenue-burn model is the counter-example everyone cites |
| AI-agent "personality" tokens | Sector −67% in weeks; ai16z −99% + class action |

## 6. Where the whitespace actually is

1. **Stablecoins have PMF but zero confidentiality.** $28T/quarter flows on transparent
   ledgers; businesses can't run payroll or supplier payments where competitors see
   everything. Institutions and the EF/Solana Foundation converged on "auditable
   confidentiality" — but no neutral, multi-chain, compliance-native confidential payment
   asset/network exists yet. Privacy is simultaneously the top-performing narrative (ZEC).
2. **Agent-payment rails are live; the trust/credit layer is missing.** x402/AP2/Tempo give
   agents a way to *pay*, but nothing gives them *identity, solvency guarantees, reputation,
   or netting* — the reasons B2B commerce runs on credit, not cash. This is the canonical
   "infrastructure ahead of demand" gap named by CoinDesk/Chainalysis.
3. **Verifiable compute became cheap; nobody made it money.** Proof costs collapsed 10x to
   ~3.5¢, real-time proving on consumer GPUs; GPU DePINs have real revenue but their tokens
   are un-investable because payment ≠ verification (you trust the operator ran the job).
   a16z's "verifiable cloud compute" thesis has no canonical asset.
4. **Value accrual is the new litmus test.** The market now prices tokens on revenue →
   buyback/burn (Hyperliquid) and punishes emissions-subsidized models (restaking, DePIN 1.0,
   PoL). Any new token must have a fee engine from day one.
