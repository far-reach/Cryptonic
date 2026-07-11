# JOULE Feasibility Investigation — Compute-Backed Money (July 2026)

**Question investigated:** Is JOULE (a currency minted against, and redeemable for,
verifiably-delivered GPU compute) a good idea to build, and can it make money?

**Verdict: Do not build JOULE as money. The monetary thesis fails on economics, not
just on the zkML dependency the original audit flagged.** The verification problem is
real but improving; the fatal problems are that compute is a structurally *deflating,
non-storable, heterogeneous* commodity — close to the worst possible backing asset for
a currency — and that the adjacent monetizable ideas are already being built by funded
teams (GAIB, USD.AI) who deliberately chose to back a **dollar** with compute economics
rather than denominate money **in** compute. There is a salvageable, revenue-bearing
kernel inside JOULE (verified-compute settlement / compute forwards), but it is a
marketplace product, not a currency, and it is weaker than VEIL on every 2026 litmus
test. Recommendation: stay on VEIL; harvest JOULE's verification layer as a possible
future VEIL-adjacent product, not as money.

---

## 1. What the original audit got right — and where it was too generous

The `token-ideas.md` audit flagged one blocker: zkML verification of large-model
inference isn't practical in 2026, forcing TEE reliance that undercuts trustlessness.
That holds up, with nuance:

- **zkML progressed faster than the audit implied.** Lagrange's DeepProve is now
  production-grade (12M+ proofs generated, open-sourced), benchmarked 54–158x faster
  at proof generation than EZKL, and in July 2025 proved a **full GPT-2 inference** —
  the first complete LLM proven in ZK. Proving overhead has fallen roughly
  1,000,000x → 100,000x → 10,000x year over year.
- **But GPT-2 is a 1.5B-parameter museum piece.** Nothing close to production-scale
  inference (70B+, MoE, long-context) is ZK-provable at economically sane cost in
  2026. At ~10,000x overhead, proving a $1 inference job costs ~$10,000 of compute.
  The audit's conclusion stands: real deployments verify with **TEEs** (NVIDIA
  H100/B200 confidential-compute mode), and the academic literature (NDSS'26 SoK on
  accelerator TEEs) shows why that's an uncomfortable trust root: only 3 of 44
  surveyed accelerator vendors ship complete attestation; GPU TEEs depend on the CPU
  TEE for their trust chain; side channels are mitigated, not eliminated; and the
  root of trust is NVIDIA + Intel/AMD key infrastructure — precisely the centralized
  dependency a "trustless commodity money" cannot admit.

So the audit's T4 failure is confirmed. But the audit scored JOULE **Pass** on T3
(token necessity) and called it "the most novel monetary idea." The outside evidence
says the monetary design itself is unsound, independent of verification. That is the
bigger finding.

## 2. The economics kill it: compute is a terrible backing asset

**(a) Compute is structurally deflationary.** H100 rental prices fell from ~$8/hr in
late 2024 to ~$2.53/hr in mid-2026 (spot as low as $1.43), with consensus forecasts
of $1.50–$2.50 by late 2026 — a ~64–70% decline in 18 months, driven by 300+ new
providers and each new silicon generation delivering more FLOPs per dollar. A JOULE
holder — someone saving in "normalized GPU-seconds" — would have lost roughly two
thirds of their purchasing power versus the dollar over that period. This is not a
cyclical accident; it is the permanent trajectory of semiconductor economics. Money
needs a stable or appreciating store of value; JOULE is a claim on the
fastest-depreciating major commodity in the world economy. The "flatcoin" framing
(Vitalik's term) assumes the reference basket holds real value; compute does the
opposite.

**(b) Compute is not storable, so "backing" is actually credit risk.** Gold in a
vault backs a warehouse receipt. A GPU-second not consumed *now* is gone forever —
"redeemable compute" is a **forward contract on a service**, contingent on the
provider still being online, solvent, and honest at redemption time. JOULE's backing
is therefore counterparty credit exposure to DePIN operators, dressed as commodity
backing. The whitepaper claim "credibly asset-backed" doesn't survive this: the asset
does not exist until the moment of delivery.

**(c) Heterogeneity breaks the unit.** "Normalized GPU-second" must span H100s vs
B200s vs consumer cards, interconnect quality, datacenter reliability, and workload
shape (training vs inference vs rendering). Every normalization formula is a
governance attack surface, and every hardware generation forces a re-basing — i.e.,
recurring, discretionary monetary policy in a system whose pitch is that it has none.

**(d) No natural holder demand.** Who wants to hold JOULE? Compute *buyers* have no
reason to prepay for a commodity in structural oversupply and price decline — spot is
always the better trade. Compute *sellers* want dollars, not exposure to their own
inventory. Savers demonstrably don't want non-dollar units: the entire non-USD
"stable asset" category (RAI, Ampleforth/AMPL, SPOT) remains a rounding error after
6+ years, and post-Terra, confidence in exotic stability mechanisms collapsed.
Stablecoin PMF at $290B supply / ~$28T quarterly volume is *dollar* PMF. A
compute-denominated unit fights the strongest empirical result in crypto.

## 3. The market already routed around this design

Two funded teams looked at the same "compute meets money" opportunity and both
concluded the currency should be a **dollar** and compute should be the **yield
source** — which is a strong market signal about where the demand actually is:

- **USD.AI (Permian Labs)** — GPU-collateralized lending protocol issuing USDai
  (T-bill-backed dollar) and sUSDai (yield from GPU-backed loans to AI startups).
  Raised $13M (Framework, Dragonfly, DCG, Coinbase Ventures). Real traction: ~$1.19M
  fees in 30 days, ~$3.6M trailing-year revenue, #2 on Arbitrum by 30-day revenue,
  sUSDai yielding ~370bps over 3-month T-bills through 2026.
- **GAIB** — "economic layer for AI infrastructure": tokenizes GPU-cluster and
  robotics financing deals; AID is a treasury-backed synthetic dollar, sAID carries
  the compute-financing yield. Ran GPU tokenization pilots with Aethir on BNB Chain;
  scaling deals through 2026.

Neither makes compute the *unit of account* — they make it collateral and yield. If
compute-denominated money were the prize, these teams (with capital and GPU-supply
relationships Cryptonic doesn't have) were positioned to build it and chose not to.
JOULE's differentiation ("payment tied to verification") is real but orthogonal — it
improves the *marketplace*, not the case for a new *denomination*.

**The DePIN base rate remains hostile.** Sector market cap ~$19B against ~$72M total
FY2025 on-chain revenue (Messari) — an aggregate ~260x price/sales. Genuine revenue
exists (Render ~$38M in January 2026; Akash ~$4.2M ARR at 80%+ utilization; Bittensor
~$43M/quarter) but providers churn when emissions tighten (Akash bled providers into
2026; io.net's verified GPU count fell). JOULE would launch into a category the
market already prices as narrative-heavy, exactly when the repo's own T1 test demands
fee engines from day one.

## 4. Can it make money? The honest revenue picture

JOULE's stated revenue = mint/redeem spread + verification fees. Both depend on
bootstrapping a **two-sided market** (attested provider capacity AND redemption
demand) before any fee flows — the hardest cold-start in crypto, attempted in a bear
market, in a sector with a 98%+ failure base rate, against incumbents (io.net, Akash,
Render, Aethir) who could bolt on TEE attestation faster than JOULE can bootstrap
liquidity. Compare: VEIL charges bps on stablecoin flows that already exist at $28T/quarter.
JOULE charges bps on flows that don't exist yet, in a unit nobody has demonstrated
demand to hold. Expected value strongly favors VEIL.

**What IS monetizable inside the JOULE idea** (if ever revisited, as products, not money):

1. **Verified-compute settlement layer** — escrow that releases stablecoin payment
   only on TEE attestation (now) / ZK proof (later) of job delivery, sold as
   infrastructure to existing DePINs and x402 agent payments. This is the genuinely
   novel kernel ("payment ≠ verification" is a real, unsolved gap — a16z's
   "verifiable cloud compute" thesis) and it earns fees in dollars without inventing
   a currency. It could even become a VEIL feature: confidential *and* verified B2B
   compute payments.
2. **Compute forwards/futures** — standardized, honestly-framed forward contracts on
   GPU-hours (what JOULE actually is, once you strip the money costume). Real hedging
   demand may emerge from AI startups fearing price spikes, but in today's deflationary
   market this is early, and it's a derivatives venue (heavier regulatory surface than
   the "commodity framing" the audit assumed — prepaid *service credits* are benign,
   but tradeable redeemable claims on future delivery drift toward CFTC territory).
3. **GPU financing yield** — already taken by USD.AI/GAIB with capital and origination
   pipelines; do not compete there.

## 5. Verdict

| Question | Answer |
|---|---|
| Good idea to build as designed (compute-backed money)? | **No.** Backing asset is deflationary, non-storable, heterogeneous; no natural holder; verification layer trust-rooted in NVIDIA/Intel until zkML matures ~2–4 more orders of magnitude. |
| Will it make money? | **Very unlikely as a currency.** Two-sided cold start before any fee revenue; hostile DePIN base rate; funded competitors captured the adjacent (better) design. |
| Is anything worth keeping? | **Yes** — the verified-compute settlement kernel (pay-on-proof escrow) as a future product or VEIL extension, and the zkML trendline is worth re-checking yearly (DeepProve's trajectory suggests small/medium-model inference becomes provable-at-reasonable-cost before 2028). |
| Opportunity cost | VEIL passes all four litmus tests with demand proven today; JOULE fails T4 outright and, on this evidence, T1 and the flatcoin premise too. Every month on JOULE is a month not spent on the idea this repo already validated and started building. |

**Re-evaluation triggers** (conditions under which JOULE-like ideas become interesting):
zkML overhead reaches ~100x for ≥7B-parameter inference; GPU price deflation flattens
(supply/demand equilibrium); a liquid TradFi compute-futures market emerges (validates
the unit); or an existing DePIN with real utilization wants to buy a verification layer.

---

## Sources

**zkML state of the art**
- [Lagrange — Announcing DeepProve](https://lagrange.dev/blog/announcing-deepprove-zkml)
- [Lagrange — DeepProve-1: first zkML system to prove a full LLM inference (GPT-2)](https://lagrange.dev/blog/deepprove-1)
- [Lagrange open-sources DeepProve: 12M+ proofs, production-grade](https://santamariatimes.com/online_features/press_releases/lagrange-labs-open-sources-deepprove-the-first-production-grade-zkml-system-to-generate-over-12/article_b9d0b2c0-5217-56b3-bee5-64904bcc2809.html)
- [Extropy — The zkML Singularity: 2025 analysis](https://academy.extropy.io/pages/articles/zkml-singularity.html)
- [ICME Labs — The Definitive Guide to ZKML (2025)](https://blog.icme.io/the-definitive-guide-to-zkml-2025/)

**TEE / confidential-compute trust model**
- [SoK: Analysis of Accelerator TEE Designs (NDSS 2026)](https://cse.sustech.edu.cn/faculty/~zhangfw/paper/sok-xputee-ndss26.pdf)
- [NVIDIA — Confidential Computing on H100 GPUs](https://developer.nvidia.com/blog/confidential-computing-on-h100-gpus-for-secure-and-trustworthy-ai/)
- [Intel Trust Authority — GPU remote attestation](https://docs.trustauthority.intel.com/main/articles/articles/ita/concept-gpu-attestation.html)
- [AppScale — Confidential computing for AI inference 2026](https://appscale.blog/en/blog/confidential-computing-ai-inference-tees-nitro-enclaves-nvidia-h100-h200-2026)

**Compute price deflation**
- [Introl — GPU Cloud Prices Collapse (Dec 2025)](https://introl.com/blog/gpu-cloud-price-collapse-h100-market-december-2025)
- [Thunder Compute — AI GPU rental market trends (July 2026)](https://www.thundercompute.com/blog/ai-gpu-rental-market-trends)
- [IntuitionLabs — H100 rental prices compared, 2026](https://intuitionlabs.ai/articles/h100-rental-prices-cloud-comparison)
- [Silicon Data — H100 rental price over time 2023–2025](https://www.silicondata.com/blog/h100-rental-price-over-time)

**Competing "compute money" designs**
- [USD.AI](https://www.usd.ai/) · [CoinDesk — USD.AI raises $13M for GPU-backed stablecoin lending](https://www.coindesk.com/business/2025/08/13/usd-ai-raises-usd13m-to-expand-gpu-backed-stablecoin-lending) · [USD.AI May 2026 recap](https://usd.ai/insights/usdai-may-2026-recap)
- [GAIB](https://gaib.ai/) · [GAIB 2026 outlook](https://blog.gaib.ai/gaib-2026-outlook/) · [GAIB × Aethir GPU tokenization pilot](https://www.accessnewswire.com/newsroom/en/blockchain-and-cryptocurrency/gaib-and-aethir-announce-success-of-first-gpu-tokenization-pilot-progr-978978)

**DePIN economics**
- [BlockEden — DePIN reality check: $19B market cap vs ~$72M revenue](https://blockeden.xyz/blog/2026/03/21/depin-march-2026-reality-check-650-projects-19b-market-cap-revenue/)
- [BlockEden — DePIN's revenue reckoning: Akash, io.net, Aethir](https://blockeden.xyz/blog/2026/03/12/depin-compute-revenue-pivot-akash-ionet-aethir/)
- [Own Your Mind — Render vs Akash vs io.net 2026 tokenomics](https://ownyourmind.ai/tokenomics/render-vs-akash-vs-ionet/)

**Non-dollar money demand**
- [MixBytes — Security of algorithmic stablecoins: FRAX, RAI, DAI, AMPL](https://mixbytes.io/blog/security-of-algorithmic-stablecoins)
- [block.science — Flatcoins: inflation-adjusted stablecoins](https://blog.block.science/flatcoins-inflation-adjusted-stablecoins/)
- [arXiv — Stablecoins: fundamentals, emerging issues, open challenges](https://arxiv.org/pdf/2507.13883)
