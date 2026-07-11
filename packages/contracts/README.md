# @veil/contracts

EVM shielded pool for VEIL confidential stablecoin payments.

## Contracts

| Contract | Role |
|---|---|
| `MerkleTreeWithHistory.sol` | Fixed-depth Poseidon incremental Merkle tree with a rolling root window (Tornado/Privacy Pools lineage). |
| `AssociationSetRegistry.sol` | Stores ASP-published approved-set roots (proof of innocence) + IPFS inclusion CIDs. |
| `VeilPool.sol` | Deposit (public) / withdraw (private ZK), nullifier double-spend prevention, relayer + protocol fee routing. |
| `verifiers/MockVerifier.sol` | CI double for the Groth16 verifier. Replace with the snarkjs-generated verifier from `circuits/withdraw.circom`. |
| `mocks/MockERC20.sol` | 6-decimal USDC stand-in for tests. |

## Circuit

`circuits/withdraw.circom` proves knowledge of a note whose commitment is in the pool tree
**and** in an approved association set, with `value` bound and only `nullifierHash` revealed.

## Develop

```bash
npm install
npm test        # compiles with the npm-provided solc (no network) and runs the suite
```

> This environment blocks `binaries.soliditylang.org`, so `hardhat.config.ts` serves solc
> 0.8.24 from the npm `solc` package via a compile subtask override. Remove that override in
> an environment where Hardhat can download compilers normally.

## Test coverage

Deposits (commitment insertion, token pull, **on-chain root == independent JS Merkle root**),
duplicate/zero-value rejection, private withdrawal with recipient/relayer/protocol fee split,
nullifier double-spend prevention, unknown-root and unknown-ASP-root rejection, invalid-proof
rejection, fee-exceeds-value rejection, and ASP operator gating.
