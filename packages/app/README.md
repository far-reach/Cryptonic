# @veil/app

The business-facing product surface: a payments client library and a `veil` CLI.

## Library

```ts
import { PaymentsClient, VeilWallet } from "@veil/app";

const wallet = new VeilWallet();                         // holds the view key + notes
const client = new PaymentsClient(pool, token, poseidon, wallet);

await client.shield(1_000_000_000n);                     // move 1,000 USDC into the pool
await client.pay(note, supplier, relayer, approvedSet, fee); // pay privately, gasless
const note = client.audit(onchainCiphertext);            // decrypt for the books / auditor
```

- `shield(amount)` — deposit into the confidential pool; the note (spending secret) is stored
  in the wallet and encrypted to the view key for audit.
- `pay(note, to, relayer, set, fee)` — a relayer generates the proof and submits the gasless
  withdrawal; the note is marked spent.
- `audit(cipher)` — decrypt an on-chain note ciphertext with the view key.
- `balance()` — sum of unspent notes.

Validated end-to-end (shield → pay with a real proof → audit) in
`@veil/contracts` `test/PaymentsApp.test.ts`.

## CLI

```bash
npm run build
node dist/cli.js init                          # create wallet.json (view key)
node dist/cli.js shield --amount 1000          # shield 1,000 stablecoins
node dist/cli.js balance
node dist/cli.js notes
node dist/cli.js pay --to 0xSupplier --amount 500 --fee 2
node dist/cli.js audit --cipher 0x...
```

Reads `veil.config.json`:

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "privateKey": "0x...",
  "poolAddress": "0x...",
  "tokenAddress": "0x...",
  "wasmPath": "../contracts/build/withdraw_js/withdraw.wasm",
  "zkeyPath": "../contracts/build/withdraw_final.zkey",
  "approvedSet": ["<commitment>", "..."]
}
```

> Prototype. The wallet stores spending secrets in plaintext JSON — encrypt at rest before any
> real use.
