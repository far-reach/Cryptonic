# VEIL

**A neutral, multi-chain confidential-payments network for stablecoins.**
Send USDC/USDT without broadcasting every amount to the world — with compliance built in as
zero-knowledge proofs, not a backdoor. *Confidentiality, not anonymity.*

VEIL targets crypto's one proven market (stablecoins: ~$290B supply, ~$28T quarterly volume)
and its best-performing narrative (privacy), assembling primitives both major ecosystems
shipped in 2025–26 into a product that regulated businesses can actually use. See the
[whitepaper](docs/whitepaper.md) for the full rationale, and
[`docs/token-ideas.md`](docs/token-ideas.md) for the logic audit that selected VEIL over two
alternatives.

## Repository layout

| Path | What |
|---|---|
| [`docs/whitepaper.md`](docs/whitepaper.md) | VEIL design, token/value-accrual, threat model, roadmap. |
| [`docs/market-research-2026.md`](docs/market-research-2026.md) | State-of-the-art crypto/Ethereum/Solana research the design is grounded in. |
| [`docs/token-ideas.md`](docs/token-ideas.md) | The three candidate concepts and the audit that chose VEIL. |
| [`packages/contracts`](packages/contracts) | EVM shielded pool (Solidity + Hardhat), circom withdrawal circuit, tests. |
| [`packages/sdk`](packages/sdk) | Client SDK: notes, Merkle proofs, association sets, view-key encryption. |
| [`packages/services`](packages/services) | Off-chain services: relayer (gasless proving) + Association Set Provider (screening). |
| [`packages/solana`](packages/solana) | Solana Token-2022 confidential-transfer prototype + CLI runbook. |

## How it works (one paragraph)

Deposits are public: you shield `value` tokens under a commitment
`Poseidon(value, Poseidon(nullifier, secret))` inserted into a Merkle tree, and the note is
encrypted to a **view key** so you (or an auditor you choose) can later decrypt it. Withdrawals
are private: a zero-knowledge proof shows your commitment is in the pool tree **and** in an
approved **association set** (proof of innocence) without revealing which deposit is yours,
revealing only a nullifier to stop double-spends. A protocol fee on each withdrawal funds an
on-chain buyback-and-burn; the VEIL token is the slashable bond that keeps the rail
un-censorable.

## Quick start

```bash
# from the repo root
npm install --workspaces

# EVM shielded pool — compiles (offline solc) and runs the full suite
npm run test:contracts     # 7 passing

# Client SDK — notes, merkle proofs, association sets, view keys
npm run test:sdk           # 8 passing

# Solana prototype — type-check
npm run typecheck:solana
```

## Status

Prototype. Implemented: EVM shielded pool + tests (on-chain Merkle root cross-checked against
an independent computation); client SDK + tests; withdrawal circuit compiled with a Groth16
trusted setup into a real verifier; **relayer + Association Set Provider services, tied together
in a full end-to-end test — user deposits, ASP screens & publishes, relayer generates a real
proof and settles a gasless withdrawal, auditor decrypts the note (11/11 contract tests
passing)**; Solana scaffolding + runbook. Next: cross-chain settlement (ERC-7683), the
buyback-and-burn + staking module, a public trusted-setup ceremony, and an independent audit.
See the whitepaper roadmap.

> Not audited. Not for production use. Research prototype.
