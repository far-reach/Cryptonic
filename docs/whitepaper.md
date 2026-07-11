# VEIL — A Confidential-Payments Network for Stablecoins

**Draft v0.1 · July 2026**

> Confidentiality, not anonymity. A neutral, multi-chain rail that lets businesses and
> individuals send stablecoins without broadcasting every amount to the world — while
> proving, in zero knowledge, that funds trace to a screened source and letting the account
> holder grant selective disclosure to an auditor.

---

## 1. Motivation

Stablecoins are the one part of crypto with undisputed product-market fit: ~$290B in supply
and ~$28T of quarterly transfer volume by mid-2026, a US legal framework (GENIUS Act), and
banks issuing their own. Yet every one of those transfers is public. A company that pays
salaries, suppliers, or contractors in USDC exposes its payroll, margins, counterparties, and
runway to any competitor with a block explorer. This single property — total transparency —
keeps the best payment rail ever built out of ordinary commercial use.

At the same time, privacy has become the best-performing narrative of the cycle (Zcash's
shielded supply grew from 8% to ~30% of ZEC in ~18 months), and both major ecosystems shipped
the exact primitives needed to fix the stablecoin gap:

- **Ethereum**: Privacy Pools and Railgun (with proof-of-innocence), endorsed by Vitalik
  Buterin and integrated into the Ethereum Foundation's Kohaku wallet toolkit; real-time
  zkEVM proving driving proof costs to ~3.5¢; ERC-7683 cross-chain intents.
- **Solana**: Token-2022 **Confidential Transfer** (ElGamal-encrypted amounts + ZK proofs)
  with an issuer-designated **auditor key**, wrapped by the Solana Foundation's March 2026
  institutional privacy framework — explicitly branded "confidentiality, not anonymity".

What does not exist is a **neutral, cross-chain product with a native asset** that assembles
these into confidential stablecoin payments usable by regulated businesses. VEIL is that
product.

## 2. Design goals

1. **Confidential, not anonymous.** Hide amounts and unlink sender from receiver; keep the
   system auditable through disclosure the account holder controls, never a protocol backdoor.
2. **Compliance-native.** Withdrawals prove membership in an approved association set (proof
   of innocence) so honest users can demonstrate their funds are not commingled with illicit
   flows — without revealing which deposit is theirs.
3. **Neutral.** No single company can censor or switch off the rail. Neutrality is enforced by
   a staked, slashable operator set — the reason the token must exist.
4. **Multi-chain.** Native shielded pools on both EVM chains and Solana, bridged by intents.
5. **Value-accruing from day one.** A protocol fee on every shielded transfer funds an
   on-chain buyback-and-burn of the VEIL token — no reliance on emissions.

## 3. Architecture

### 3.1 EVM shielded pool (implemented)

A per-stablecoin shielded pool built on a Poseidon incremental Merkle tree.

- **Deposit (public):** the sender picks a secret note `(value, nullifier, secret)`, computes
  `commitment = Poseidon(value, Poseidon(nullifier, secret))`, transfers `value` tokens into
  the pool, and the commitment is inserted as a tree leaf. The note is encrypted under a
  **view key** and emitted as calldata so an auditor holding that key can later reconstruct it.
- **Withdraw (private):** the spender produces a Groth16 proof (`circuits/withdraw.circom`)
  that they know a note whose commitment is (a) in the pool tree at a known root and (b) in an
  approved association set at a known root, whose value equals the public withdrawal amount,
  revealing only a `nullifierHash = Poseidon(nullifier, nullifier)` to prevent double-spend.
  Funds are sent to a fresh recipient address, splitting out a relayer fee (gasless UX) and a
  protocol fee.

Contracts (`packages/contracts`): `MerkleTreeWithHistory.sol` (Poseidon tree with a rolling
root window), `AssociationSetRegistry.sol` (ASP-published approved-set roots + public IPFS
inclusion lists), `VeilPool.sol` (deposit/withdraw, nullifier tracking, fee routing). The
construction deliberately follows the audited Tornado/Privacy Pools lineage; VEIL's novelty is
the association-set + view-key + multi-chain product layer, not the accumulator.

### 3.2 Proof of innocence (compliance without a backdoor)

An **Association Set Provider (ASP)** curates the set of deposits it will vouch for — e.g.
every deposit except those linked to sanctioned addresses — and publishes that set's Merkle
root on-chain plus the full inclusion list off-chain for independent audit. Because a
withdrawal proves membership in *both* the pool tree and an approved set, an honest user
demonstrates their funds trace to screened sources while remaining unlinkable. VEIL is
policy-agnostic and supports competing ASPs; users choose which attestation to carry. This is
the mechanism Vitalik Buterin publicly endorsed via Privacy Pools.

### 3.3 View keys (selective disclosure)

Each note is encrypted to a viewing public key using ephemeral-static X25519 ECDH →
SHA-256 → XChaCha20-Poly1305 (`packages/sdk/src/viewkey.ts`). Whoever holds the secret — the
depositor, and anyone they choose, such as an auditor or tax authority — can decrypt the
amount and trace the spend. Nobody else can, and the key cannot move funds. This is opt-in
transparency the holder grants, the inverse of a master key the protocol holds.

### 3.4 Solana realization

On Solana, Token-2022 Confidential Transfer provides encrypted balances natively, and the
mint's **auditor ElGamal key is the direct analog of VEIL's view key**. `packages/solana`
contains the mint scaffolding JS can build plus a `spl-token` CLI runbook
(`confidential-payroll.sh`) for the end-to-end confidential-payroll flow, and a mapping table
from VEIL concepts to Solana confidential-transfer instructions.

### 3.5 Cross-chain (design)

Shielded balances on EVM and Solana are unified by an ERC-7683 intent flow: a shielded USDC on
Base can settle to a shielded recipient on Solana in one action, with solvers fronting
liquidity. (Specified; not yet implemented.)

## 4. Token & value accrual

`protocolFeeBps` (target 5–15 bps) of every withdrawal routes to a `feeCollector` that, in
production, forwards to an on-chain buyback-and-burn module — the Hyperliquid-style revenue →
burn loop the 2026 market rewards. VEIL is additionally staked by the relayers and provers who
process shielded transactions and by ASP operators; they are slashed for censorship, downtime,
or vouching for a set they cannot substantiate. **The token is the network's neutrality bond,
not a governance sticker** — a confidential rail is only credible if no company can switch it
off, which requires a decentralized, economically-secured operator set.

No pre-mine to a VC tranche; emissions (if any) flow only to actual fee-paying usage.

## 5. Threat model & honest risks

- **Regulatory / developer liability.** The Roman Storm conviction (one count; retrial
  proposed Oct 2026) leaves US developer liability for privacy tooling unresolved. VEIL's
  compliance-first architecture (proof of innocence, view keys, per-ASP policy) is the
  mitigation and the differentiator versus anonymity-maximizing designs.
- **ASP centralization (v0).** The first ASP is a single operator. This is a trust
  assumption, addressed by staking/slashing and multi-ASP support in later versions.
- **Incumbent risk.** Circle or a chain could ship native confidential USDC; VEIL's answer is
  neutrality (multi-issuer, multi-chain, un-switch-off-able) and being the rail rather than a
  feature of one issuer.
- **Cryptographic / implementation risk.** Shielded pools are high-value targets; the pool
  reuses the well-studied Tornado/Privacy Pools construction and must be independently audited
  before mainnet. The trusted setup for the Groth16 circuit requires a public ceremony.
- **Anonymity-set risk.** Confidentiality quality depends on pool usage; small pools leak
  through timing/amount correlation. Fixed-denomination modes and batching are future work.

## 6. Status & roadmap

**Implemented in this repository**
- EVM shielded pool (Poseidon Merkle tree, deposit/withdraw, nullifiers, ASP registry, fee
  routing) with a passing test suite that cross-checks the on-chain Merkle root against an
  independent computation.
- Client SDK: note management, Merkle proofs, association-set membership proofs, view-key
  encryption — with tests and a cross-check that SDK and on-chain roots agree.
- Withdrawal circuit (`withdraw.circom`, 22,486 constraints), compiled with a Groth16 trusted
  setup into a real `Verifier.sol`. **An end-to-end test verifies a real proof on-chain**:
  the SDK builds the witness → circom → proof → the generated verifier accepts it inside
  `VeilPool.withdraw`, funds settle, replay is blocked, and tampered signals are rejected.
- Solana confidential-transfer scaffolding + CLI runbook.
- **Relayer service** (reconstructs the pool tree, generates the proof, submits gasless
  withdrawals) and **Association Set Provider service** (screens deposits, builds and publishes
  the approved-set root) — validated by a full end-to-end test with a real proof: user deposits →
  ASP screens & publishes → relayer proves & settles gaslessly → auditor decrypts the note.
- **Token & value-accrual module**: the `VeilToken` (fixed 1B supply, burnable), a permissionless
  `BuybackBurner` that swaps accumulated protocol fees into VEIL and burns them (tested being fed
  by a real pool withdrawal's fee), and `VeilStaking` (slashable bonds for relayers/provers/ASPs
  with an unstake cooldown). This closes the revenue → buyback-and-burn loop in code.
- **Cross-chain shielded payments** (`crosschain/VeilCrossChain.sol`): an ERC-7683-style
  open → fill → claim flow where a solver shields destination-chain funds for the recipient and
  is repaid from the origin escrow after a settlement-oracle attestation (refundable after the
  deadline).
- **Staking-gated relayer**: `VeilPool` can require any fee-earning relayer to be an active,
  slashable operator (`VeilStaking.isActive`).
- **Business payments app** (`@veil/app`): a `PaymentsClient` (`shield` / `pay` / `audit`) and a
  `veil` CLI, validated end-to-end with a real proof.

**Next (pre-production)**
1. Run a public multi-party Powers-of-Tau + phase-2 ceremony (the in-repo setup generates the
   toxic waste locally, which is fine only for a prototype).
2. Replace the mock settlement oracle with a canonical cross-chain messaging attestation
   (LayerZero / CCIP / Wormhole / Hyperlane).
3. Hardened key storage for the wallet; an ASP HTTP service with real AML/sanctions screening.
4. Independent security audit.
4. Buyback-and-burn module and staking/slashing for relayers/provers/ASPs.
5. Independent security audit + public trusted-setup ceremony.

## 7. Prior art

Tornado Cash (fixed-denomination mixing), Privacy Pools / 0xbow (proof of innocence), Railgun
(shielded balances), Aztec (a privacy L2), Zcash (shielded UTXOs), Solana Confidential Transfer
(encrypted balances + auditor key). VEIL's contribution is not a new cryptographic primitive
but a **neutral, compliance-native, multi-chain confidential-payments product for stablecoins,
with a token whose sole job is to keep that rail un-censorable** — the intersection of Vitalik
Buterin's "low-risk defi" and "why I support privacy" theses, aimed at crypto's one proven
market.
