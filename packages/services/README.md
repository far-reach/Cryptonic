# @veil/services

Off-chain services that make VEIL usable: the **relayer** and the **Association Set Provider**.

## Modules

- `prover.ts` — `proveWithdraw(...)`: generates a real Groth16 withdrawal proof (via snarkjs +
  the circuit's wasm/zkey). This is what the relayer runs so users never need the proving
  toolchain.
- `poolClient.ts` — `buildPoolTree(...)`: reconstructs the pool's commitment tree from on-chain
  `Deposit` events, so the relayer can build inclusion proofs without trusting an indexer.
- `asp.ts` — `AspService`: screens deposits against a denylist (stand-in for AML/sanctions
  screening), builds the approved association set, and publishes its root to the on-chain
  registry with an IPFS inclusion-list CID.
- `relayer.ts` — `Relayer`: given a user's note + recipient + fee, reconstructs the tree, builds
  the Merkle and association-set witnesses, generates the proof, and submits the withdrawal —
  gasless and proof-free for the user, who can receive to a fresh address.

## Design note

ethers is a *type-only* peer here (the modules take contract-like objects), so the library stays
runtime-agnostic — the caller supplies wired ethers `Contract`/`Wallet` instances. This is what
the end-to-end test in `@veil/contracts` (`test/E2E.test.ts`) does with a real proof.

## Build

```bash
# requires @veil/sdk built first (packages/sdk: npm run build)
npm install
npm run build        # or: npm run typecheck
```

## Running a relayer (sketch)

```ts
import { ethers } from "ethers";
import { buildVeilPoseidon } from "../sdk/dist/index.js";
import { Relayer } from "@veil/services";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(RELAYER_KEY, provider);
const pool = new ethers.Contract(POOL_ADDR, POOL_ABI, wallet);

const relayer = new Relayer(pool, {
  wasmPath: "build/withdraw_js/withdraw.wasm",
  zkeyPath: "build/withdraw_final.zkey",
  poseidon: await buildVeilPoseidon(),
  relayerAddress: wallet.address,
});

// A user submits { note, recipient, fee } to your API; you call:
await relayer.relayWithdraw(note, recipient, approvedSet, fee);
```
