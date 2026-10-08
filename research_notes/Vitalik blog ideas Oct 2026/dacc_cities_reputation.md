# Vitalik's physical-world d/acc and social/institutional ideas: development and market status as of October 8, 2026

Method note: WebSearch only (WebFetch blocked). ~37 searches ran before the shared per-turn search budget was exhausted; seven planned follow-up queries (undercollateralized-lending 2026 volumes, Ethos Network, PopVax first-dosing confirmation, open-source BCI/OpenBCI 2026, Ginkgo "Perimeter" spin-out, consumer home pathogen sensors, Próspera 2026 resident/business counts) could not run and are listed in Gaps. All figures are dated where the source allows; aggregator figures (Tracxn, PitchBook, Crunchbase, LeadIQ) are flagged as unverified.

---

## Idea 1: d/acc biosecurity (far-UVC, pathogen monitoring, open vaccines, verifiable hardware, Balvi/SHIFT, "defensive tech" VC)

### Takeaway
Biosecurity is the most "partially developed" of Vitalik's physical-world ideas: real companies, real pilots and real trials exist, but almost all of it is grant-, philanthropy- or government-contract-funded rather than venture-scale, and the two things Vitalik keeps asking for (a cheap, proven, consumer-grade far-UVC fixture, and a cheap consumer/home pathogen detector) still do not exist as products. Verdict: PARTIALLY DEVELOPED (monitoring and trials), LARGELY UNDEVELOPED (consumer hardware, verifiable chips).

### Cited Findings

Far-UVC companies
- Uviquity (far-UVC semiconductor chips, not lamps) emerged from stealth May 7, 2025 with a $6.6M seed led by Emerald Development Managers, with AgFunder and MANN+HUMMEL participating; roadmap was prototypes in 2025, customer samples in 2026, pilot production 2027, foundry transfer 2028 — [BioSpace press release](https://www.biospace.com/press-releases/uviquity-emerges-from-stealth-with-6-6m-seed-funding-to-develop-breakthrough-far-uvc-semiconductor-technology-for-human-safe-photonic-disinfection); [AgFunderNews](https://agfundernews.com/from-bulky-bulbs-to-tiny-chips-uviquity-emerges-from-stealth-with-far-uvc-disinfection-breakthrough)
- Aggregators conflict on later Uviquity money: Tracxn says $8.15M over 3 rounds / 4 investors with a Sept 2025 round; PitchBook lists a $1.55M early-stage VC deal on Sept 22, 2025. Neither matches the company's own announcements — treat as unverified — [Tracxn](https://tracxn.com/d/companies/uviquity/__paO5wI21l2Ip7MGwTVsDjgrc1KGJykNxjlzODt1BLko); [PitchBook](https://pitchbook.com/profiles/company/519811-84)
- Jul–Oct 2026 shipped: Uviquity announced the first chip-scale deep-UV laser at 229 nm in 2026 and is sampling to OEM partners; on Aug 7, 2026 former Coherent CEO Chuck Mattera joined as strategic advisor; the same AlN platform is described as enabling far-UVC disinfection "under development" (i.e., disinfection product not yet shipping) — [Semiconductor Today, Aug 2026](https://www.semiconductor-today.com/news_items/2026/aug/uviquity-070826.shtml)
- Far UV Technologies (Kansas City, 222 nm krypton-chloride "Krypton" lamps): latest round Dec 2024 (Tracxn: seed, $1.6M total; PitchBook: later-stage VC $1.4M, $2.6M total — conflicting). Revenue has come mainly from US Air Force/AFWERX contracts (TACFI award 2022; additional USAF contract per company site). No 2026 funding round found — [Tracxn](https://tracxn.com/d/companies/faruvtechnologies/__yXGz8S3Dg_BLaZm-s5tDesUU9J6OlHq-2nIhAn2PxWM); [PitchBook](https://pitchbook.com/profiles/company/221702-77); [Far UV Technologies USAF contract](https://faruv.com/far-uv-technologies-secures-additional-us-air-force-contract/)
- Incumbent market structure: Ushio holds exclusive rights to Columbia's 2012 filtered-222nm patent (Care222); Acuity Brands has exclusive North American rights to put Care222 in luminaires and its module was the first 200–230 nm GUV source UL-certified for occupied spaces; Ushio's own brochure concedes Care222 costs more than conventional mercury lamps — [Acuity Brands IR](https://investors.acuityinc.com/news-releases/news-release-details/acuity-brands-filtered-far-uvc-module-ushio-care222-technology); [Ushio brochure](https://www.ushio.com/files/brochure/care222-filtered-far-uv-c-excimer-lamp-module.pdf); [Care222 partners](https://www.care222.com/care222-partners)
- Efficacy evidence remains lab/room-scale: Columbia occupied-room study with four ceiling 222 nm fixtures, within ACGIH limits, cut airborne infectious murine norovirus surrogate by 99.8% — [PMC10954628](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10954628/)
- Safety counter-evidence exists: a March 2025 bioRxiv preprint reports far-UVC causes direct DNA damage in human lung cells/tissues — [bioRxiv 2025.03.20.644314](https://www.biorxiv.org/content/10.1101/2025.03.20.644314.full.pdf)
- Standards: ASHRAE Standard 241 "Control of Infectious Aerosols" (approved June 2023) counts germicidal UV toward "equivalent clean airflow" but is not mandatory; ACGIH 2022 TLV for skin at 222 nm is 478 mJ/cm² over 8 h, while ICNIRP's 222 nm limit is 23 mJ/cm²; no 2026 standards revision or regulatory mandate for far-UVC was found — [UVDI on ASHRAE 241](https://www.uvdi.com/2024/07/12/ashrae-241-and-uv-technology/); [Nature Sci Rep 2024 office study](https://www.nature.com/articles/s41598-024-75245-z)

Blueprint Biosecurity / EXHALE
- Blueprint announced EXHALE award recipients Nov 13, 2025: ~$1M to two teams — Seema Lakdawala (Emory) with Linsey Marr (Virginia Tech) on influenza, and Joshua Santarpia (UNMC) on influenza + SARS-CoV-2 — to test far-UVC against real human-generated respiratory aerosols. Status as of Blueprint's one-year program page (~late Aug 2026): "Ongoing." No EXHALE results published as of Oct 8, 2026 — [Blueprint far-UVC program status](https://blueprintbiosecurity.org/resource/where-our-far-uvc-program-stands-one-year-after-the-blueprint/); [Blueprint far-UVC program](https://blueprintbiosecurity.org/program/far-uvc/)
- Blueprint also runs a SAFE-UVC RFP on skin safety — [SAFE-UVC RFP](https://blueprintbiosecurity.org/safe-uvc-rfp/skin-safety/)

Pathogen monitoring (Lungfish, SecureBio, Ginkgo)
- Lungfish 2025 annual report (published Feb 24, 2026): first year included weekly wastewater metagenomics at 30 sites in 11 US states, air sampling in schools and healthcare facilities, field sequencing in Panama, partnerships in Zambia, Nepal and Taiwan; 8 sites publish data on a public dashboard. Its homepage now cites 40+ US wastewater sites. The report frames the work against sharply declining federal surveillance funding. No budget figure found in snippets — [Lungfish 2025 annual report](https://lung.fish/blog/2026-02-24-lungfish-2025-annual-report/); [Lungfish homepage](https://lung.fish/)
- Lungfish 2026 blog items: measles-in-wastewater publication and launch of an ORCHARDS-AIR study — [Lungfish blog](https://lung.fish/blog/)
- SecureBio's August 2026 detection update (within the Jul–Oct window): expanded biosurveillance network, "substantially improved" nasal-swab monitoring sensitivity, new partnerships, and a 10-week pilot on transmission dynamics at mass gatherings (concerts, sports, conventions). Its CASPER network processed samples from 24 cities as of June 1, 2026 — [SecureBio Aug 2026 update](https://securebio.org/blog/updates-aug-2026/); [CASPER](https://securebio.org/casper/)
- Ginkgo Biosecurity remains institutional/government-facing: CDC Traveler Genomic Surveillance (>14,000 samples sequenced; expanded to 30+ pathogens), the Doha CUBE-D hub (Feb 28, 2024), and an Illumina co-marketing deal. A ~April 2026 item reports "Ginkgo Biosecurity spins out as Perimeter" — details could not be retrieved (budget exhausted). No consumer device found — [XWELL/CDC release](https://www.xwell.com/news-releases/news-release-details/ginkgo-bioworks-and-xwell-implement-expanded-cdc-traveler-based); [PRNewswire CUBE-D](https://www.prnewswire.com/news-releases/ginkgo-biosecurity-launches-doha-based-pathogen-monitoring-center-cube-d-establishing-middle-east-hub-for-global-bioradar-at-qatar-free-zones-302072637.html); [Tectonic Defense: Perimeter spin-out](https://www.tectonicdefense.com/ginkgo-biosecurity-spins-out-as-perimeter/)

PopVax (open-source vaccines)
- PopVax's broadly protective COVID-19 vaccine is funded by $20M from Balvi and the Gates Foundation; the company's site says Phase I begins in Australia "mid-2026," and its blog said "in just a few months (August 2026)." It cites positive pre-IND feedback from the US FDA. An earlier plan (2024) for a NIAID-sponsored US Phase I starting early 2025 appears superseded. No source confirming first participant dosed was found before the search budget ran out — [PopVax vaccines page](https://popvax.com/vaccines); [PopVax Chronicles NIH update](https://chronicles.popvax.com/p/popvax-updates-nih-niaid-will-conduct); [Absolutely Maybe Apr 30, 2026](https://absolutelymaybe.plos.org/2026/04/30/another-intranasal-covid-vaccine-starting-in-the-us-nextgen-vax-monthly-update/)
- PopVax pipeline per its jobs page: HCV, Strep A, adult pulmonary TB, influenza, malaria, HPV, liver and pancreatic cancer; it also launched a "PopVax Biosecurity" unit — [PopVax jobs](https://jobs.popvax.com/); [Announcing PopVax Biosecurity](https://chronicles.popvax.com/p/apocalypse-later-popvax-biosecurity)

Verifiable hardware (IRIS / Baochip)
- bunnie Huang's IRIS (infra-red in-situ) non-destructive chip inspection has progressed to a robot that images whole chips at micron-scale in minutes; it only works on packages exposing the die backside and cannot resolve individual gates, so it must pair with scan-chain electrical tests — [bunnie's blog IRIS updates](https://www.bunniestudios.com/blog/2024/iris-infra-red-in-situ-project-updates/); [Hackster IRIS robot](https://www.hackster.io/news/andrew-bunnie-huang-s-iris-robot-peers-behind-silicon-chips-to-uncover-their-secrets-in-minutes-4e3383e06124)
- 2026: DEF CON 34's badge ships the Baochip-1x (350 MHz VexRiscv RISC-V, 4MB ReRAM, 2MB SRAM, TSMC 22nm), packaged for IRIS so owners can check transistor patterns against published RTL; a $10 "Dabao" dev board is being crowdfunded. Huang calls the design "mostly open" (bootloader fully open; most compute logic open/NDA-free) — [DEF CON 34 Baochip badge](https://aiweekly.co/alerts/def-con-34-ships-bunnie-huangs-open-source-baochip-as-its-badge); [Hackster Dabao crowdfunding](https://www.hackster.io/news/andrew-bunnie-huang-opens-crowdfunding-for-the-radically-open-dabao-baochip-1x-dev-board-be3fc5add565); [BankInfoSecurity Apr 2026](https://www.bankinfosecurity.asia/in-open-source-silicon-we-trust-bunnie-huangs-baochip-a-31406)
- Vitalik's "full-stack openness and verifiability" argument explicitly extends to hardware (microarchitectural flaws break "provably secure" systems; open code + verifiable hardware + ZK/FHE/DP needed). On Jan 30, 2026 he said he withdrew 16,384 ETH (~$45M) to deploy toward these goals over several years (note: the assignment dated the essay Sep 2025; coverage ties the funding post to Jan 2026 — the essay and the ETH commitment may be separate events) — [The Block](https://www.theblock.co/post/387804/vitalik-buterin-commits-roughly-45-million-in-eth-to-open-source-security-and-privacy-projects); [Blockonomi summary](https://blockonomi.com/full-stack-openness-pushes-crypto-boundaries-vitaliks-new-call-to-action)

Balvi, SHIFT, d/acc funding
- SHIFT Grants (launched at Edge Esmeralda, June 2025): "$200K+" initial funding across six areas (biosecurity, cyber defense, information resilience, infrastructure, neurotech, social tech); anchor funders Vitalik Buterin, Trent McConaghy, ASI Alliance/Ocean Protocol Foundation, Yoni Ben-Shimon, plus Jake Hartnell (WAVS). Biosecurity examples named: open-source vaccines, far-UVC, decentralized epidemic detection. No 2026 round or list of 2026 awardees found — [SHIFT Grants](https://www.edgecity.live/shift-grants)
- Balvi: described as a "scientific investment and direct gifting fund"; past grants include $3M to Patient-Led Research Collaborative and the $20M (with Gates) to PopVax. No 2026 Balvi grant announcements found — [PLRC Balvi release](https://patientresearchcovid19.com/balvi-press-release/); [PopVax vaccines](https://popvax.com/vaccines)
- Vitalik's own "d/acc: one year later" cites verifiable open-source vaccines and enhanced air filtration as practical results — [Krypto News summary](https://kryptonews.de/vitalik-buterin-reviews-year-one-of-decentralized-defense-initiative/)
- Coefficient Giving (formerly Open Philanthropy) still runs a Biosecurity & Pandemic Preparedness fund in 2026 — [Coefficient Giving](https://coefficientgiving.org/funds/biosecurity-pandemic-preparedness/)
- "Defensive tech" VC in 2026 means military defense tech, not d/acc: trackers put defense-tech VC at ~$17.8B in Q1 2026 or >$14.6B YTD (definitions vary). No fund branded "d/acc" or investing on a d/acc thesis was found — [Axis Intelligence](https://axis-intelligence.com/defense-tech-funding-statistics/); [ValueAdd VC](https://valueaddvc.com/defense-tech)
- Open-source science money is flowing to software, not hardware: Renaissance Philanthropy's Open Source for Science Fund launched May 2026 with $20M from Biohub and Wellcome — [Renaissance Philanthropy (Wikipedia)](https://en.wikipedia.org/wiki/Renaissance_Philanthropy)

### Inferences
- Jul–Oct 2026 deliverables in this bucket were incremental: a Uviquity laser demo and advisor hire, a SecureBio network expansion, Blueprint's EXHALE still "ongoing," PopVax Phase I "about to start." Nothing crossed from pilot to product.
- Far-UVC's commercial bottleneck is structural: the IP sits with Ushio/Acuity (lamp) and the chip route (Uviquity) is on a 2027–2028 pilot-production timeline. There is no venture-backed company shipping a sub-$200 consumer far-UVC fixture, and safety evidence (lung-cell DNA damage preprint; ICNIRP vs ACGIH 20x gap in limits) is unresolved, which is exactly what EXHALE/SAFE-UVC are meant to settle.
- Pathogen monitoring is maturing as nonprofit public infrastructure (Lungfish, SecureBio) and government contracting (Ginkgo), not as a consumer product; the "cheap device in every home/office" Vitalik described remains unbuilt.
- Verifiable hardware has one credible artifact (Baochip-1x at DEF CON 34) and one tool (IRIS), both run by one person's lab on NLnet/crowdfunding money; no startup is funded to productize IRIS-style attestation.
- Vitalik's ~$45M ETH commitment (Jan 2026) is the largest identifiable 2026 pool for this agenda; SHIFT's $200K+ is grant-scale.

### Gaps
- No published EXHALE results; no 2026 ACGIH/ASHRAE/IES far-UVC rule changes found.
- Could not confirm PopVax first-participant dosing in Australia (search budget exhausted).
- No 2026 Balvi grant list; no SHIFT 2026 awardee list.
- Ginkgo "Perimeter" spin-out: terms, funding and products unknown.
- No reliable far-UVC market-size figure for 2026; no 2026 funding round for any far-UVC lamp company found.
- Lungfish and SecureBio budgets/revenue not disclosed in retrieved text.
- Consumer/home pathogen-detector startups (e.g., Poppy Health) not searched before budget ran out.

---

## Idea 2: Crypto cities / network states / pop-up cities

### Takeaway
Pop-up cities are now a repeatable, partly self-funding product (Edge City runs 3+ villages/year at ~850 residents for its flagship and Vitalik reports it is cash-flow positive), and Praxis has finally broken ground — but as a ~20% slice of someone else's Uruguayan real-estate megaproject, not a sovereign city. Próspera is stuck in a multi-year ICSID case. Verdict: PARTIALLY DEVELOPED (pop-ups, EdgeOS), LARGELY UNDEVELOPED (new jurisdictions, legal templates, on-chain land registries).

### Cited Findings

Edge City / Edge Esmeralda
- Edge Esmeralda 2026 ran May 30–June 27, 2026 in Healdsburg, CA (third edition). Organizers' month-in-review: ~850 residents, 60+ countries, 48 kids, 4 thematic weeks, 800+ sessions, 10 residencies (incl. Long Journey and Zee Prime residencies). Pre-event figures varied (500+, 800+, 1,000+) — [Edge Esmeralda 2026 Month in Review](https://edgeesmeralda2026.substack.com/p/edge-esmeralda-2026-month-in-review); [Edge Esmeralda About](https://www.edgeesmeralda.com/about)
- Edge City is a project of Edge Institute, Inc., a 501(c)(3); it reports $2.5M in grants allocated to builders; it has received an Ethereum Foundation grant; ticket sales (early-bird pricing) and partners/sponsors fund villages. No revenue breakdown published — [Edge City About](https://www.edgecity.live/about); [Edge City homepage](https://www.edgecity.live/); [Edge City India 2026](https://www.edgecity.live/india26)
- Vitalik, "Let a thousand societies bloom" (Dec 17, 2025): Edge City "has perfected a pipeline of organizing popups" and he has "heard it is a cash-flow-positive business"; he flags that popups are expensive (short-term rent) and Edge City is "not cheap to attend" — [vitalik.eth.limo](https://vitalik.eth.limo/general/2025/12/17/societies.html)
- Edge City's 2026 posture: "leaning more into being a catalyst: actively shaping, funding, and accelerating what emerges," with a new ecosystem-building hire; it published a "Roadmap: Building a Network City" — [Edge City Roadmap](https://www.edgecity.live/roadmap); [Edge City newsletter Feb 2026](https://www.edgecity.live/blog/edge-city-newsletter---february-2026)
- Upcoming (Jul–Oct window and after): Edge City India (Goa) Oct 11–Nov 1, 2026; Edge City Bhutan Nov 11–19, 2026 — [Edge City all events](https://www.edgecity.live/all-events)
- EdgeOS: open-source resident portal (applications, passes, housing, fiat + crypto payments), developed by SimpleFi (p2planes) with Edge City and Esmeralda support; Edge City says it is "undergoing a significant upgrade to make it even more usable for other popup city experiments." No licensing/pricing model announced — [EdgeOS GitHub](https://github.com/p2p-lanes/EdgeOS); [World Builder Residency](https://www.edgecity.live/world-builder-residency)
- Permanent town: Edge Esmeralda is a "living prototype for a permanent walkable town" 15 min north of Healdsburg; the Esmeralda company's proposal covers 266 acres at the southeast edge of Cloverdale, where opponents are organizing for a possible ballot fight and demanding a new EIR — [Patch: Cloverdale development battle](https://patch.com/california/healdsburg/northern-california-town-readies-next-stage-development-battle); [Press Democrat](https://www.pressdemocrat.com/article/news/edge-esmeralda-healdburg-cloverdale/)
- Edge City co-founder Timour Kosters' framing of the business: popups' main output is "culture"; goal is "the cultural R&D and economic engine" for "neo-tribes" — [Timour Kosters note](https://substack.com/@timour/note/c-190910128)
- Vitalik's essay also surfaces the "network nations"/"coordi-nations" strand (functional, not territorial, sovereignty) with Gitcoin research and a Network Nations Alliance — [Gitcoin research](https://gitcoin.co/research/network-nations-building-sovereignty-without-land); [Network Nations Alliance](https://networknations.network/)

Praxis
- Praxis raised $525M in commitments (2024) for a crypto/AI city — [dig.watch](https://dig.watch/updates/praxis-raises-525-million-for-futuristic-city-project-to-merge-cryptocurrency-and-ai)
- Atlas, CA: proposed June 2025 as a 3,850-acre defense-focused spaceport city at Vandenberg SFB; a 2026 review still lists it as "active pursuit." No groundbreaking, permit or land deal found as of Oct 2026 — [Praxis on X](https://x.com/praxisnation/status/1930346932209365202); [Crypto Cities Part 3: 2026 edition](https://www.capturetheflag.today/crypto-cities-part-3-the-2026-edition/)
- Jul–Oct 2026 shipped: On Sept 22, 2026 Praxis announced construction has begun on "Praxis I" at +Colonia (next to Colonia del Sacramento, Uruguay), residents to move in 2027 (NYT coverage). Plan: ~$1B over three years; ~$300M already mobilized and 100,000 m² under development across the +Colonia project; Praxis takes ~20% of phase-one buildable area. +Colonia (515 ha, 7 km coastline, 120 ha with infrastructure) is led by Argentine developer Eduardo Bastitta and has been under construction since 2022; buildings Quartier +Colonia and El Muelle I are sold out for 2027 delivery — [Praxis on X, Sep 2026](https://x.com/praxisnation/status/2102412604488458299); [El Observador](https://www.elobservador.com.uy/cafe-y-negocios/la-comunidad-praxis-proyecta-una-inversion-us-1000-millones-colonia-y-mudara-sus-primeros-residentes-2027-n6058077); [Latin Times](https://www.latintimes.com/colonia-praxis-uruguays-1-billion-megaproject-city-rising-across-buenos-aires-599549); [Praxis Uruguay page](https://www.praxisnation.com/uruguay)
- Earlier Praxis timelines slipped: a 2025 article expected a 2025 groundbreaking at a Mediterranean site later abandoned — [The Fence](https://the-fence.com/praxis-makes-perfect/)

Próspera
- ICSID Case ARB/23/2 under CAFTA-DR (filed Dec 2022; original claim US$10.775B; Oct 2025 memorial seeks restoration of rights or alternatively US$1.63B + US$1M moral damages). Pending; seat Washington, D.C. — [IAReporter case page](https://www.iareporter.com/arbitration-cases/prospera-v-honduras/); [The Dark Atlas](https://thedarkatlas.com/posts/prospera-private-city-honduras)
- 2026 procedure: Procedural Order No. 6 (bifurcation) March 19, 2026; tribunal declined to bifurcate (IAReporter, Apr 15, 2026); PO No. 7 on amicus applications May 6, 2026; tribunal rejected Honduras's preliminary objection that CAFTA-DR consent required exhausting local remedies (holding the "no-U-turn" clause incompatible with exhaustion and that local remedies would have been futile), postponed costs, and ordered proceedings to continue — reported Sept 9, 2026 — [IISD ITN Sept 9, 2026](https://www.iisd.org/itn/2026/09/09/icsid-tribunal-rejects-honduras-attempt-to-condition-cafta-dr-consent-ifeoluwa-oyemade/); [Jus Mundi PO7](https://jusmundi.com/en/document/decision/en-honduras-prospera-inc-st-john-s-bay-development-company-llc-and-prospera-arbitration-center-llc-v-republic-of-honduras-procedural-order-no-7-on-applications-to-intervene-by-amicus-curiae-wednesday-6th-may-2026); [Kluwer Arbitration Blog](https://legalblogs.wolterskluwer.com/arbitration-blog/a-local-remedies-pitfall-avoided-for-now-key-takeaways-from-honduras-prospera-inc-v-honduras/)
- Honduras re-joined ICSID: signed March 6, 2026, ratified July 17, re-entered into force Aug 16, 2026; 18 cases including Próspera's remain. Honduras's Supreme Court declared the ZEDE framework unconstitutional in 2024; the new Asfura (National Party) government inherits the dispute — [Rio Times: Honduras ICSID return](https://www.riotimesonline.com/honduras-icsid-return-investors-energy-reform-2026/); [Rio Times: Próspera critics](https://www.riotimesonline.com/prospera-zede-honduras-modern-coup-sovereignty-2026)

Sector-wide
- A 2026 network-state atlas: "there is no completed example of a network state"; closest attempts are Próspera (charter city), Praxis ("funded but unbuilt" pre-Sept 2026), Liberland (unrecognized), Network School. Forma (ex-Solana Economic Zones) is building a permanent UK campus; "Arc" is Network School's L2 aimed at an eventual charter city — [Sovereignty Atlas](https://sovereigntyatlas.com/guides/what-is-a-network-state/)
- No 2026 seed round for a "pop-up city OS" or new-society legal-template startup was found in searches — [vcbacked seed directory (no matches)](https://www.vcbacked.co/directory/funding/seed/page/155)

### Inferences
- The only "crypto city" business with evidence of positive unit economics is the event/popup format (Edge City), and it is organized as a nonprofit; EdgeOS is open-source and unmonetized. The pop-up pipeline is developed; the "OS for societies" as a product is not.
- Praxis's Sept 2026 groundbreaking is real but reframes the project from sovereign city to anchor-tenant/co-developer within a conventional Uruguayan real-estate scheme; Atlas remains a proposal.
- Próspera's jurisdictional wins in 2025–2026 keep the claim alive but a merits decision is years away; jurisdictional-innovation risk is visibly priced by the Cloverdale ballot fight and Honduran politics.
- The Vitalik asks that remain unbuilt: a reusable legal/jurisdictional template that lets a popup graduate into a permanent zone; on-chain land/registry primitives in any of these projects (none surfaced); and cheaper-than-market popups (he himself notes cost as the main barrier).

### Gaps
- No Edge City financials (ticket revenue vs. grants); no EdgeOS adoption count by third-party popups.
- Próspera 2026 resident/business counts and revenue not retrieved (search budget exhausted).
- No Praxis financial disclosure on how much of the $525M commitments has been drawn.
- No on-chain land registry deployments found in any of these projects.

---

## Idea 3: Soulbound tokens / on-chain reputation, attestations, credentials, undercollateralized credit

### Takeaway
Attestation infrastructure is developed (EAS ~9.5M attestations / 450k attesters; Coinbase Verifications live on Base) and proof-of-personhood is a real market (World ID ~18M humans, Human Passport ~2.3M users with ~44M credentials), but undercollateralized on-chain credit built on reputation has not scaled: 3Jane pivoted in June 2026 to buying fintech loan receivables, Wildcat's live "total credit given" shows ~$16M, and institution-issued credentials are vendor-driven pilots (India's AKTU 50,000 degrees). Verdict: DEVELOPED (attestation rails, PoP), LARGELY UNDEVELOPED (reputation-based lending, negative reputation).

### Cited Findings

Attestations
- attest.org currently lists "Attestations: 9.5M+" and "Attesters: 450k+" across networks (page indexed ~May 2026) — [attest.org](https://attest.org/)
- Per-chain explorers: Optimism EAS shows 1,317,667 attestations / 822 schemas / 20,676 unique attesters; the mainnet explorer shows only ~13,990 attestations / 389 schemas / 808 attesters — meaning most volume is on L2s — [Optimism EAS explorer](https://optimism.easscan.org/); [easscan.org](https://easscan.org/)
- Coinbase Verifications issues KYC/country/Coinbase One attestations via EAS on Base from verifications.coinbase.eth; Base explorer shows "Verified Coinbase One" attestations being created continuously; Coinbase intends to let third parties issue verifications — [coinbase/verifications GitHub](https://github.com/coinbase/verifications); [Base EAS explorer](https://base.easscan.org/); [Blockworks](https://blockworks.com/news/coinbase-identity-verification-kyc)

Human Passport / Holonym / proof of personhood
- Holonym Foundation acquired Gitcoin Passport Feb 2025 (then 2.1M+ users, 34.5M credentials) and renamed it Human Passport; a later human.tech post cites 2.3M+ users and 44M credentials; OpenHaven (third party, undated) estimates ~$1M annual revenue at acquisition — [human.tech acquisition post](https://human.tech/blog/holonym-foundation-acquires-gitcoin-passport-and-launches-human-tech); [human.tech $HUMN post](https://human.tech/blog/humn-is-coming-what-you-should-know); [OpenHaven](https://openhaven.net/prototype/protocols/human-passport/)
- Jul–Oct 2026 shipped: Holonym Q2 2026 update (July 10, 2026): NFC biometric-passport verification via ZKPassport (free 3-month attestation or $3 for one year); Passport-score gating of a Giveth Security Fund round; Plume Season 2 airdrop used Passport (score >20 for flagged users); Immunefi began verifying security researchers with Passport; Shield privacy bridge to Aztec; Nethermind audit — [Holonym Q2 2026 update](https://human.tech/blog/holonym-foundation-quarterly-update-q2-2026)
- Competitive context: World ID's April 17, 2026 relaunch cites ~18M verified humans in 160 countries, account-based architecture with key rotation/recovery, and integrations with Tinder (US), Zoom, Docusign, Vercel, Okta — [BusinessWire Apr 17, 2026](https://www.businesswire.com/news/home/20260417530721/en/The-New-World-ID-Proof-of-Human-for-the-AI-Era-Scales-Across-the-Digital-Platforms-People-and-Businesses-Use-Every-Day); Self Protocol (NFC passport + ZK) claims Google uses its proof-of-human and Opera relies on it for "millions of verifications" (self-reported) — [self.xyz](https://self.xyz/)
- Academic formalization: "A Cryptographic Framework for Proof of Personhood" (IACR ePrint 2026/333) — [ePrint 2026/333](https://eprint.iacr.org/2026/333)

On-chain credit / undercollateralized lending
- 3Jane: Paradigm led a $5M seed (2025); model = unsecured USDC credit lines using on-chain data + zkTLS proofs of off-chain credit scores, with a "Credit Slasher" penalizing defaults and legally binding agreements — [The Block](https://www.theblock.co/post/356872/paradigm-leads-5-million-seed-round-in-crypto-credit-startup-3jane); [Web3 Research Global](https://www.web3researchglobal.com/p/3jane)
- June 10, 2026 public launch pivoted to "Fintech Credit Conduits": a $10M senior warehouse facility and first phase of a $50M forward-flow program, starting with an ~$8.5M whole-loan purchase of SMB credit lines and BNPL receivables; USD3 depositors reportedly earn ~8.5%, junior tranche sUSD3 up to ~15.4% APY; JANE token issuance to be finalized in 2026. DefiLlama TVL snippets conflict ($21.2M vs $62.1M). Whether the consumer crypto-native credit score is still live is undocumented — [Crypto Briefing](https://cryptobriefing.com/3jane-launches-warehouse-line-forward-flow/); [DefiLlama 3Jane](https://defillama.com/protocol/3jane); [Leviathan News](https://leviathannews.substack.com/p/3jane-lending-protocol-explained)
- Wildcat (undercollateralized credit, borrower-set terms): seed extension $3.5M (Robot Ventures); V2 on Ethereum reported ~$150M outstanding and >$368M originated (circa 2025); the protocol's own homepage shows "Total Credit Given $16,394,329.23" (undated) — the two figures could not be reconciled — [The Block: Wildcat $3.5M](https://www.theblock.co/post/369453/wildcat-labs-3-5-million-usd-round-robot-ventures); [The Block: V2 launch](https://www.theblock.co/post/339378/wildcat-decentralized-credit-platform-laurence-day-launches-version-ethereum); [wildcat.finance](https://wildcat.finance/)
- Spectral (MACRO on-chain credit score; $23M raise Aug 2022 led by General Catalyst, $6.75M in 2021) — no 2026 lending volume or product news found; Cred Protocol appears only in a 2026 vendor comparison of DeFi credit scores — [TechCrunch 2022](https://techcrunch.com/2022/08/24/spectral-raises-23m-to-help-create-web3-credit-scores/); [ChainAware comparison](https://chainaware.ai/blog/defi-credit-score-comparison/)
- 2026 commentary frames AI-driven credit scoring as the route to undercollateralized DeFi, still at "unlocking" stage — [bex.co Apr 11, 2026](https://bex.co/blog/2026/04/11/ai-under-collateralized-defi-lending-credit-scoring)

Institution-issued credentials
- India: AKTU plans ~50,000 blockchain-based degrees in one convocation cycle; MIT World Peace University issued blockchain-anchored degrees to 2,568+ students (Blocsys, Aug 2026, vendor source) — [Blocsys Aug 2026](https://blocsys.com/how-universities-are-replacing-paper-degrees-with-blockchain-credentials/)
- US: Central New Mexico CC and ECPI University cited as having issued blockchain diplomas at scale (vendor source) — [SoluLab](https://www.solulab.com/blockchain-based-digital-credentials-for-universities)
- Europe: EBSI + eIDAS 2.0 mandate EUDI wallets for diplomas; a 2026 arXiv paper proposes ERC-3643/OnchainID issuer accreditation and notes the top-down EU model limits post-issuance correction — [arXiv 2607.16383](https://arxiv.org/pdf/2607.16383)
- Vendor outcome data: BCdiploma claims 75% of EDHEC grads actively use digital diplomas and a 98% cut in credentialing time; Blocsys concedes public evidence is limited on whether recruiters trust blockchain credentials more than ordinary digital certificates — [BCdiploma 2026 report](https://www.bcdiploma.com/en/blog/the-2026-digital-credential-impact-report-measuring-business-value-across-administrative-issuance-and-institutional-strategy)

### Inferences
- Attestation rails have found their product-market fit in Sybil-resistance and KYC gating (airdrops, grant rounds, exchange verifications) — a modest, B2B, mostly fee-free market; Human Passport's ~$1M revenue (old estimate) versus World's 18M-user scale shows the money is in proof-of-personhood for AI-era platforms, not in Soulbound-style composable reputation.
- The most-funded reputation-lending attempt (3Jane, Paradigm) effectively abandoned reputation-based retail credit in June 2026 for off-chain receivables financing, a strong signal that on-chain reputation is not yet underwriting-grade. Wildcat's live figures (~$16M) suggest undercollateralized DeFi credit is still small and relationship-based.
- Nothing found implements Vitalik's "negative reputation" (non-transferable debts/penalties that a user cannot shed by rotating wallets); 3Jane's Credit Slasher is the closest and its enforceability is questioned.

### Gaps
- No 2026 aggregate undercollateralized lending volume (Maple/Wildcat/3Jane) — query could not run.
- Ethos Network (on-chain reviews/vouching with slashing) 2026 funding and usage not searched.
- No 2026 revenue figures for Human Passport, World ID or Self.
- EAS 2026 growth rate (vs. 9.5M) not available; attest.org figure may be ~5 months stale.
- No funded 2026 startup for employer-issued on-chain credentials found.

---

## Idea 4: Open-source hardware ("I support it only if it's open source", Aug 2025) and open longevity biotech

### Takeaway
Open-source medical hardware remains a grant-and-storefront niche (Tympan, Glia) with no 2026 venture rounds found; open longevity biotech's main commercial signals in 2026 are small (VitaDAO's $500K from Pfizer Ventures, a $1M seed for spinout Artan Bio). Verdict: LARGELY UNDEVELOPED commercially.

### Cited Findings
- Open-source medical device sustainability (IEEE TBME 2025 paper): Tympan (open-source hearing-aid components, NIH-funded, sells via storefront) and Glia (all source files open; manufactures in Canada, sales fund manufacturing in conflict zones) are the model examples — [IEEE TBME](https://doi.org/10.1109/TBME.2025.3563102)
- No 2026 funding round for an open-source medical hardware startup surfaced; medtech funding guides point to NIH SBIR (Phase I $275K, Phase II $1M+) as the realistic non-dilutive route — [Med Device Guide 2026](https://meddeviceguide.com/blog/medical-device-startup-funding-guide-vc-2026)
- Open-source science funding went to software: Renaissance Philanthropy's Open Source for Science Fund, May 2026, $20M seeded by Biohub and Wellcome — [Renaissance Philanthropy](https://en.wikipedia.org/wiki/Renaissance_Philanthropy)
- Hardware-verification side: Baochip-1x ("mostly open" silicon; $10 Dabao dev board crowdfunding) is the main 2026 open-hardware milestone — see Idea 1 citations ([Hackster](https://www.hackster.io/news/andrew-bunnie-huang-opens-crowdfunding-for-the-radically-open-dabao-baochip-1x-dev-board-be3fc5add565))
- VitaDAO August 2026 newsletter: $500,000 investment from Pfizer Ventures; two Nature Biotechnology articles on DAOs in life sciences; portfolio spinout Artan Bio closed a $1M seed (ARTAN-102 suppressor tRNA); AI agent "Aubrai" (with BIO) analyzed 850,000+ HSC transcriptomes (VitaSTEM). VitaDAO had funded 24 projects as of Nov 2024 — [VitaDAO newsletter Aug 2026](https://vitadao.substack.com/p/the-vitadao-longevity-newsletter-d55); [VitaDAO VitaSTEM](https://www.vitadao.com/projects/vitastem); [Bitkan on VITA](https://bitkan.com/learn/what-is-vita-and-how-does-vitadao-support-longevity-research-40530)
- VitaDAO's Zuzalu/Vitalia link: co-organized the first Zuzalu; held a 2024 Life Extension Conference at Vitalia (Próspera, Honduras) as a step toward "permanent districts dedicated to longevity" — [VitaDAO Zuzalu project](https://www.vitadao.com/projects/zuzalu)
- Open longevity tooling: Longevity Genie (open-source LLM toolbox) — [VitaDAO Longevity Genie](https://www.vitadao.com/projects/longevity-genie)

### Inferences
- The "open-source only" stance has no venture-scale counterpart in medical devices or BCIs as of Oct 2026; the funded path is NIH grants plus direct hardware sales.
- Open longevity biotech's 2026 monetization is via conventional spinouts and IP tokens, with pharma (Pfizer Ventures) entering at trivially small size.

### Gaps
- OpenBCI / open-source BCI 2026 commercial status not searched (budget exhausted); Vitalik's Aug 2025 BCI post content not retrieved.
- No open-source medical hardware VC rounds found; absence may reflect search limits rather than non-existence.

---

## Idea 5: Non-financial blockchain uses (proof-of-provenance for physical goods, open-source metrics, negative reputation)

### Takeaway
Proof-of-provenance has become a real but regulation-driven B2B business via EU Digital Product Passports (Arianee: 3.4M passports for ~50 brands), where blockchain is optional and non-blockchain competitors are gaining; "open-source metrics" and "negative reputation" have no identifiable 2026 businesses. Verdict: PARTIALLY DEVELOPED (provenance/DPP), LARGELY UNDEVELOPED (metrics, negative reputation).

### Cited Findings
- Arianee: >3.4M digital product passports in production for ~50 brands incl. Breitling and Fnac Darty (up from 1.6M earlier); Series A EUR 20M May 2022 led by Tiger Global; totals cited at $31M–$33M; no new round since 2022 (LeadIQ as of July 2026) — [Arianee DPP blog](https://www.arianee.com/en/blog/what-is-a-digital-product-passport); [Preqin](https://www.preqin.com/data/profile/asset/arianee-sas/428142); [LeadIQ](https://leadiq.com/c/arianee/5b15090c3900004201e12b52)
- EU DPP timing: Commission central DPP registry by July 2026; first mandatory DPPs (batteries) Feb 2027 per Arianee, with some sources citing Jan 2026 — [Arianee DPP tokenization](https://www.arianee.com/news/european-digital-product-passport-from-yet-another-constraint-to-a-consumption-revolution); [Protokol DPP guide](https://www.protokol.com/insights/digital-product-passport-complete-guide/)
- Blockchain is not required by the regulation; recommended only as a tamper-evident proof layer for key events; non-blockchain DPP vendors (info.link, Digital-Link) market themselves as "Arianee alternatives" — [EU Blockchain Observatory DPP report](https://blockchain-observatory.ec.europa.eu/document/download/b6e3c85c-43c1-405b-aba8-e49a71249ef7_en?filename=EUBOF_DPP_report.pdf); [Council Fire guide](https://www.councilfire.org/guides/digital-product-passports-with-blockchain-guide/); [dpp.cloud Arianee alternatives](https://www.dpp.cloud/blog-en/arianee-alternatives-2025-11-dpp-tools-beyond-blockchain-nfts)
- Other blockchain DPP players: VeChain + Rekord; Billon — [VeChain](https://vechain.org/the-digital-product-passport-is-coming.-vechain-and-rekord-are-already-building-it.); [Billon](https://billongroup.com/enterprise-solutions/trusted-document-management/digital-product-passport)
- Negative reputation: the only mechanism found is 3Jane's "Credit Slasher" (see Idea 3) — [Leviathan News](https://leviathannews.substack.com/p/3jane-lending-protocol-explained)

### Inferences
- Provenance monetization is being captured by compliance software, where the chain is a commodity back-end; the differentiated "owner-held, portable provenance" that Vitalik described is a feature, not a company.
- No one appears funded to build negative/inescapable reputation; the attestation layer (EAS) technically supports revocations and negative claims but no consumer-facing product uses them.

### Gaps
- Ethos Network and similar reputation protocols not searched (budget exhausted).
- "Open-source metrics" (public, verifiable analytics) produced no business hits in the searches run.
- No 2026 funding announcements in blockchain provenance found.

---

## Cross-cutting summary: what changed July–October 2026, and the biggest monetizable gaps

### Takeaway
The quarter produced one headline physical milestone (Praxis groundbreaking in Uruguay, Sept 22, 2026) and otherwise incremental progress (Uviquity advisor/laser sampling, SecureBio network expansion, Holonym NFC passports, ICSID procedural win for Próspera, Honduras ICSID re-entry Aug 16, EXHALE still ongoing, PopVax Phase I pending). The largest unfilled, explicitly-requested gaps are consumer far-UVC fixtures with settled safety evidence, a cheap home/office pathogen detector, a productized verifiable-chip service, a reusable jurisdictional template for popups-to-permanent, and reputation-backed credit with negative reputation.

### Cited Findings (Jul–Oct 2026 events, by date)
- Jul 10: Holonym Q2 update (NFC passports, Immunefi, Plume) — [human.tech](https://human.tech/blog/holonym-foundation-quarterly-update-q2-2026)
- ~Jul: Edge Esmeralda 2026 month-in-review (850 residents) — [Edge Esmeralda substack](https://edgeesmeralda2026.substack.com/p/edge-esmeralda-2026-month-in-review)
- Aug 7: Chuck Mattera joins Uviquity; 229 nm laser sampling — [Semiconductor Today](https://www.semiconductor-today.com/news_items/2026/aug/uviquity-070826.shtml)
- Aug (DEF CON 34): Baochip-1x badge ships — [aiweekly](https://aiweekly.co/alerts/def-con-34-ships-bunnie-huangs-open-source-baochip-as-its-badge)
- Aug 16: Honduras ICSID Convention re-enters into force — [Rio Times](https://www.riotimesonline.com/honduras-icsid-return-investors-energy-reform-2026/)
- Aug: SecureBio detection update (mass-gathering pilot, 24-city CASPER) — [SecureBio](https://securebio.org/blog/updates-aug-2026/)
- Aug: VitaDAO reports $500K Pfizer Ventures investment; Blocsys reports AKTU 50k blockchain degrees — [VitaDAO](https://vitadao.substack.com/p/the-vitadao-longevity-newsletter-d55); [Blocsys](https://blocsys.com/how-universities-are-replacing-paper-degrees-with-blockchain-credentials/)
- Late Aug: Blueprint one-year far-UVC status page lists EXHALE "Ongoing" — [Blueprint](https://blueprintbiosecurity.org/resource/where-our-far-uvc-program-stands-one-year-after-the-blueprint/)
- Sep 9: IISD reports ICSID tribunal rejecting Honduras's local-remedies objection — [IISD](https://www.iisd.org/itn/2026/09/09/icsid-tribunal-rejects-honduras-attempt-to-condition-cafta-dr-consent-ifeoluwa-oyemade/)
- Sep 22: Praxis announces construction begun at +Colonia, residents 2027 — [Praxis on X](https://x.com/praxisnation/status/2102412604488458299)
- Oct 11–Nov 1 (upcoming): Edge City India — [Edge City](https://www.edgecity.live/india26)

### Inferences (verdicts and biggest monetizable gap per idea)
1. Biosecurity — PARTIALLY DEVELOPED. Gap: a consumer-priced, safety-certified far-UVC fixture (no one outside Ushio/Acuity's licensed lamp ecosystem and Uviquity's 2027+ chip roadmap is funded for it) and a sub-$100 home pathogen sensor (no funded builder found).
2. Crypto cities — PARTIALLY DEVELOPED (popups) / UNDEVELOPED (jurisdictions). Gap: a monetizable "society OS" plus legal template (EdgeOS is free/open-source; no startup funded to sell popup-to-permanent tooling).
3. Reputation/credentials — DEVELOPED rails / UNDEVELOPED credit. Gap: reputation-underwritten unsecured credit with enforceable negative reputation (3Jane pivoted away; Wildcat ~$16M).
4. Open-source hardware/longevity — LARGELY UNDEVELOPED. Gap: any venture-scale open-source medical device company.
5. Non-financial uses — PARTIALLY DEVELOPED (DPP provenance). Gap: owner-portable provenance and negative reputation as products; no funded builders found.

### Gaps
- Seven follow-up queries could not run (search budget): 2026 undercollateralized lending volumes; Ethos Network; PopVax dosing confirmation; OpenBCI/open BCI 2026; Ginkgo Perimeter; home pathogen sensors (Poppy Health etc.); Próspera 2026 operating metrics.
- No primary-source reads were possible (WebFetch blocked), so figures from aggregator sites remain unverified.
