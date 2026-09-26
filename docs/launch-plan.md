# VEIL — Launch & Business Plan

**From working prototype to profitable business.** Draft v1 · July 2026.

This is an operating plan, not a pitch. Numbers are illustrative and grounded in the mid-2026
market research in this repo; every assumption is labelled. The honest through-line: VEIL has a
credible path to real revenue **if** it wins compliance-grade trust and durable adoption — the
technology risk is largely retired, the remaining risk is regulatory and go-to-market.

---

## 1. Executive summary

- **Product:** a neutral, multi-chain **confidential-payments rail for stablecoins** — a private
  mode for USDC/USDT where amounts are hidden and sender↔recipient is unlinked, with compliance
  enforced as zero-knowledge proofs (proof of innocence) and auditability via view keys.
  *Confidentiality, not anonymity.*
- **Why now:** stablecoins are crypto's one proven market (~$290B supply, ~$28T quarterly
  volume, GENIUS Act live) yet 100% transparent — unusable for real business finance. Privacy is
  the cycle's best-performing narrative, and both Ethereum (Privacy Pools/Kohaku) and Solana
  (Confidential Transfer) shipped the primitives. Nobody has assembled a neutral, compliance-
  native, cross-chain **product** with a native asset.
- **Wedge:** confidential B2B stablecoin payments (payroll, suppliers, treasury) for
  crypto-native companies first, then fintechs/PSPs via SDK, then regulated institutions.
- **Business model:** blended — enterprise SaaS + integration fees (predictable, early) plus a
  protocol fee on shielded volume that feeds a buyback-and-burn (scales with usage).
- **Money:** lean burn (~$4–6M year 1), seed of **$4–6M** to reach audited mainnet + first
  revenue, Series A ($15–25M) on traction. Break-even plausibly year 3–4.
- **Token:** **do not launch early.** Build on equity + stablecoin revenue; introduce the VEIL
  token only once there is real usage and regulatory clarity, via a foundation, as staking/fee
  utility — never as the fundraising mechanism.

---

## 2. Product & positioning

**What it is (already built, see repo):** shielded pools on EVM + Solana, a real ZK withdrawal
circuit, a relayer (gasless private payments), an Association Set Provider (screening +
proof-of-innocence), view-key auditability, a payments SDK/CLI, cross-chain settlement, and the
token/buyback-burn/staking economics — all tested end-to-end with a real on-chain proof.

**Positioning:** *"Stripe for confidential stablecoin payments."* Not a mixer, not an anonymity
tool. The one-line wedge with a CFO: *"Pay in stablecoins without publishing your payroll and
margins to competitors — and still pass an audit."*

**Three product surfaces (already scaffolded):**
1. **Payments app + SDK** — the integration a business/fintech embeds.
2. **The neutral rail** — the open, staked-operator network.
3. **Multi-chain** — native on EVM L2s and Solana.

---

## 3. Market

Grounded in `docs/market-research-2026.md`.

- **TAM (transparent, illustrative):** stablecoin transfer volume ≈ **$112T/yr**. Even a small
  share moving to a private mode is large.
- **SAM:** B2B / treasury / payroll stablecoin flows where transparency is a real deterrent —
  conservatively low-hundreds of $B/yr today, growing fast as banks and PSPs enter.
- **SOM (obtainable, 3-yr):** capturing **$1–10B/yr** of shielded volume is a credible target
  band — <0.01% of stablecoin volume.

**Revenue sensitivity at a 0.10% protocol fee:** $1B → $1M; $10B → $10M; $100B → $100M; $1T →
$1B. The model works at a fraction of a percent of the market. (Illustrative, not a forecast.)

---

## 4. Business model & unit economics

**Three revenue lines** (diversified so profitability doesn't depend solely on protocol volume):

1. **Protocol fee** — 5–15 bps on shielded withdrawals, in stablecoin, routed to
   buyback-and-burn (already implemented). Scales with volume; pure margin.
2. **Enterprise SaaS** — per-business subscription for the payments app, dashboards, audit
   tooling, SLAs, and a hosted relayer: **$2k–$20k/mo** by size, plus implementation fees.
3. **Infrastructure licensing / white-label** — fintechs, PSPs, and stablecoin issuers embed the
   rail under their brand: platform license + rev-share on volume.

**Illustrative unit economics (per mid-size business customer):**
- SaaS: ~$8k/mo = ~$96k/yr.
- Their shielded volume: ~$50M/yr × 10 bps = ~$50k/yr protocol fee.
- Blended ≈ **$150k/yr revenue per customer**; gross margin high (software + on-chain).
- 60–80 such customers ≈ $9–12M revenue — the break-even zone.

**Cost to serve** is dominated by fixed R&D/security/compliance, not per-customer, so margins
expand sharply with scale.

---

## 5. Go-to-market

**Sequenced wedge — land where the pain is sharpest and the buyer is fastest:**

- **Phase A — Crypto-native companies (beachhead, months 0–9).** Funds, trading firms, DAOs,
  crypto startups already paying salaries, contractors, and OTC deals in stablecoins. They hold
  the asset, feel transparency pain acutely, tolerate early tooling, and buy fast. Target 5–10
  design partners pre-mainnet, 20–40 paying by month 12.
- **Phase B — Fintechs & PSPs (months 9–24).** Sell the SDK/white-label so they offer
  confidential stablecoin rails to *their* customers (B2B2C leverage). One PSP integration = many
  end-users.
- **Phase C — Regulated institutions & cross-border B2B (year 2+).** Lead with the compliance
  story (proof of innocence, view keys, auditor access). Longer cycles, larger contracts.

**Channels & partnerships:**
- **Stablecoin issuers** (Circle, Paxos, PayPal, bank issuers) — distribution + credibility.
- **Screening providers** (Chainalysis, TRM, Elliptic) — power the ASP; co-marketing on the
  "compliant privacy" narrative.
- **Payroll/vesting platforms** (Toku, Rise, LiquiFi), custody/wallets, and treasury tools —
  embed VEIL as the private-payment option.
- **Auditors & law firms** — reference the view-key model so their clients can adopt.

**Motion:** founder-led enterprise sales for Phase A, developer-relations + SDK for Phase B,
partnerships/BD for Phase C. Content: publish the compliance design, security audits, and real
throughput/cost numbers — trust is the product.

---

## 6. Regulatory & compliance strategy (the crux)

This determines whether VEIL is a business or a lawsuit. Treat it as a first-class workstream,
not an afterthought.

- **Architecture is the defense.** Stay **non-custodial**: the protocol never controls user
  funds; contracts are immutable; relayers are permissionless; the company operates software, not
  a money-transmission service. This is the distinction the Tornado Cash / Roman Storm cases turn
  on — design to be on the right side of it, and get written legal opinions confirming it.
- **Compliance is a feature, not a bolt-on.** Proof-of-innocence (screened association sets via
  Chainalysis/TRM) + view keys (auditor/regulator selective disclosure) directly answer the AML
  objection to privacy tools. Ship it as the headline, publicly documented.
- **Engage early.** Proactive dialogue with FinCEN and relevant regulators; SAR-friendly design;
  a published transparency/compliance policy. Do not launch quietly and hope.
- **Entity & jurisdiction.** Dual structure: a **for-profit Labs company** (builds software,
  raises equity, sells SaaS) + a separate **foundation/protocol entity** (stewards the neutral
  network and any future token). Base the Labs co in a clear jurisdiction; obtain legal opinions
  before mainnet. Register as a VASP where the ASP/relayer services require it.
- **Tax transparency (CARF/DAC8).** The view-key model is designed to satisfy reporting — make
  that explicit to institutional buyers.
- **Watch the calendar.** US market-structure (CLARITY) and the Storm retrial (Oct 2026) are
  live variables; sequence the token and any custodial features around regulatory clarity.

---

## 7. Competitive landscape & moat

| Competitor / adjacent | Gap VEIL fills |
|---|---|
| Zcash / mixers | Anonymity, no compliance story, not stablecoin/business-oriented |
| Aztec (privacy L2) | A whole new chain to adopt; VEIL is a rail over existing stablecoins |
| Railgun / Privacy Pools | Primitives, not a business-facing product with SaaS + multi-chain + neutrality |
| Circle native confidential USDC (risk) | Single-issuer, switch-off-able; VEIL is neutral, multi-issuer, multi-chain |

**Moat:** (1) compliance-native design that anonymity tools can't retrofit; (2) neutrality +
anonymity-set network effects (privacy quality compounds with usage); (3) ASP + regulator +
issuer relationships; (4) first credible "confidential stablecoin rail" brand; (5) the staked
operator set (token) making the rail un-censorable.

---

## 8. Product roadmap to mainnet (pre-production checklist)

Everything below is what stands between the current prototype and real funds:

1. **Public trusted-setup ceremony** (multi-party Powers-of-Tau + phase-2) to replace the
   single-party dev setup. ~$50–150k, 6–10 weeks, external participants.
2. **Independent security audits** — ≥2 top-tier firms on contracts + circuit; formal
   verification of the circuit; a public bug-bounty (Immunefi, $250k+ pool). $300–600k.
3. **Real cross-chain messaging** — replace the mock settlement oracle with LayerZero / CCIP /
   Wormhole / Hyperlane.
4. **Production relayer + ASP services** — hardened, monitored, with the ASP wired to a real
   screening provider; decentralize the relayer set over time (staking already built).
5. **Hardened key storage** — encrypted wallet, hardware-wallet/passkey support, recovery UX.
6. **Testnet pilots** with design partners; then **mainnet on one EVM L2 + Solana**, small caps
   first, scaling as the anonymity set and audits mature.
7. **SOC 2 / infosec** for enterprise buyers.

---

## 9. Team & hiring (first 18 months)

- **Now → seed:** founders + the existing engineering (ZK/protocol) — enough to reach audited
  testnet.
- **Post-seed (6–8 hires):** 2 protocol/ZK engineers, 1 full-stack/app, 1 devrel/SDK, 1
  compliance/legal lead, 1 BD/enterprise sales, 1 founding designer/PM, part-time
  security/finance.
- **Post-Series A (→ ~20):** scale engineering, sales, compliance, and a partnerships team.

Compliance and BD hires are as critical as engineers — this is a trust business.

---

## 10. Fundraising

- **Seed — $4–6M** (18–24 mo runway). Use of funds: audits + ceremony (~20%), team (~50%),
  legal/regulatory (~15%), GTM/BD (~10%), infra (~5%). Milestone: audited mainnet + first
  paying customers + measurable shielded volume.
- **Series A — $15–25M** on traction (customers, volume, revenue). Scale GTM, chains, institutions,
  and decentralize the operator set.
- **Investors:** crypto-native funds that understand infra + regulation (and can open issuer/
  institution doors) over generalist tourists. Equity now; token later, if ever.

---

## 11. Financials & path to profitability (illustrative)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Team size | 8 | 14 | 22 |
| Opex (burn) | $4–6M | $8–10M | $12–15M |
| Customers | 5–20 | 40–80 | 120–250 |
| Shielded volume | pilot | $1–5B | $10–30B |
| Revenue (SaaS + protocol) | <$0.5M | $6–12M | $20–40M |
| Net | burn (seed) | near / at break-even | **profitable** |

**Break-even logic:** ~$9–12M revenue covers a ~$10M cost base — reachable with ~70–120 blended
enterprise customers **or** ~$10B/yr shielded volume, or a mix. The blended model (SaaS +
protocol) reaches profitability years earlier than protocol fees alone. Profitability is
plausible in **year 3–4** on-plan.

---

## 12. Metrics / KPIs

- **North star:** monthly shielded volume (and its retention).
- Protocol revenue + SaaS ARR; VEIL burned (if token live).
- Paying business customers; net revenue retention; logo retention.
- Anonymity-set size per pool (privacy quality); relayer/ASP decentralization.
- Compliance: % withdrawals with proof-of-innocence; zero sanctioned-flow incidents.
- Reliability: proof-gen latency, relayer uptime, cost per private payment.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Regulatory / developer liability** (biggest) | Non-custodial architecture, compliance-native design, legal opinions, proactive regulator engagement, jurisdiction choice |
| **Adoption/demand slower than hoped** | Blended SaaS revenue reduces volume dependence; start with the sharpest-pain beachhead |
| **Incumbent ships native private stablecoin** | Neutrality (multi-issuer, multi-chain, un-switch-off-able); move first; own the compliance-privacy brand |
| **Cryptographic / audit failure** | Multiple audits, formal verification, public ceremony, bug bounty, staged caps at launch |
| **Anonymity-set bootstrapping** (small pools leak) | Seed liquidity, fixed-denomination modes, batching, concentrate on few deep pools |
| **Token/regulatory misstep** | Delay token; equity-first; foundation structure; utility not speculation |
| **Key-management UX** (users lose notes) | Encrypted wallets, passkeys, recovery, custodial option for enterprises |

---

## 14. 24-month timeline

- **Q1 (0–3 mo):** close seed; legal entity + opinions; audit engagement; launch trusted-setup
  ceremony; sign 5–10 design partners; ASP integration with a screening provider; public testnet.
- **Q2 (3–6 mo):** complete audits; testnet pilots; real cross-chain oracle; hardened relayer;
  compliance policy published; SOC 2 kickoff.
- **Q3 (6–9 mo):** **mainnet launch** (one EVM L2 + Solana, capped); first paying customers;
  begin Phase B (SDK/white-label) conversations.
- **Q4 (9–12 mo):** scale customers; cross-chain live; measure PMF (volume + retention); prep
  Series A.
- **Year 2:** raise Series A; expand chains; institutional pilots; decentralize relayers/ASP;
  evaluate token launch **only if** usage + regulatory clarity justify it; drive toward
  break-even.

---

## 15. The one-paragraph thesis

VEIL turns crypto's one proven market — stablecoins — into something businesses can actually use,
by adding the one thing it lacks (confidentiality) without the one thing regulators won't accept
(anonymity). The hard technology is built and demonstrated. The company that wins is the one that
pairs that technology with **compliance-grade trust and enterprise distribution** faster than
incumbents can bolt privacy on or regulators can slam the door. That is an execution-and-timing
bet with a clear path to real cash flow and a very large ceiling — the right kind of bet.

> Not investment advice. Financials are illustrative planning figures, not forecasts. Unaudited
> research prototype; not for production use until the Section 8 checklist is complete.
