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
| [`packages/contracts`](packages/contracts) | EVM shielded pool, token/buyback-burn/staking module, cross-chain settlers (Solidity + Hardhat), circom withdrawal circuit, tests. |
| [`packages/sdk`](packages/sdk) | Client SDK: notes, Merkle proofs, association sets, view-key encryption. |
| [`packages/services`](packages/services) | Off-chain services: relayer (gasless proving) + Association Set Provider (screening). |
| [`packages/app`](packages/app) | Business payments client + `veil` CLI (shield / pay / audit). |
| [`packages/web`](packages/web) | Local dashboard at `localhost:3000` that runs & visualizes a real confidential payment. |
| [`packages/solana`](packages/solana) | Solana Token-2022 confidential-transfer prototype + CLI runbook. |
| [`packages/trader`](packages/trader) | Cryptonic autotrader: conservative Binance spot grid bot (250 USDT class) with backtester, paper mode, and hard risk limits. |

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

## Deploy & run the live demo

```bash
cd packages/contracts
npx hardhat node &                                       # local devnet
npx hardhat run scripts/deploy.ts  --network localhost   # deploy the full stack
npx hardhat run scripts/demo.ts    --network localhost   # run a real confidential payment
```

The demo prints the whole flow end-to-end (verified live against a local node with the real
Groth16 verifier):

```
1. business shielded 1000.0 USDC (balance now private)
2. ASP published approved-set root (proof of innocence available)
3. relayer paid supplier 996.0 USDC privately (business paid no gas)
   relayer fee: 3.0 USDC · protocol fee -> buyback&burn: 1.0 USDC
4. auditor decrypted the shielded note with the view key: 1000.0 USDC
```

Prefer a visual? Run the dashboard instead of the CLI demo — with the node + deploy from above:

```bash
cd packages/web && npm install && npm start   # -> http://localhost:3000
```

Click **Run a confidential payment** to execute the real flow and see the public (encrypted)
view beside the auditor's decrypted view. See [`packages/web`](packages/web).

Point the same scripts at a testnet with `--network sepolia` (set `SEPOLIA_RPC_URL` and
`DEPLOYER_PRIVATE_KEY`). See [`deployments/`](deployments).

## Status

Prototype. Implemented: EVM shielded pool + tests (on-chain Merkle root cross-checked against
an independent computation); client SDK + tests; withdrawal circuit compiled with a Groth16
trusted setup into a real verifier; relayer + Association Set Provider services; token +
buyback-and-burn + staking/slashing module (value-accrual loop tested from a real pool fee);
cross-chain shielded payments (ERC-7683-style open → fill → claim); a staking-gated relayer;
and a **business payments app (`shield`/`pay`/`audit`) tested end-to-end with a real proof —
26/26 contract tests passing**. Remaining before production: a public trusted-setup ceremony,
a real cross-chain messaging oracle, hardened key storage, and an independent security audit.
See the whitepaper roadmap.

> Not audited. Not for production use. Research prototype.
