# @veil/sdk

Client SDK for VEIL: notes, Merkle proofs, association sets, and view-key encryption.

## Modules

- `note.ts` — create notes; compute `commitment`, `nullifierHash`; encode/decode for encryption.
- `merkle.ts` — Poseidon Merkle tree matching `MerkleTreeWithHistory.sol` and `withdraw.circom`;
  proof generation/verification.
- `asp.ts` — build an association set, get its root, produce membership proofs (proof of innocence).
- `viewkey.ts` — X25519 + XChaCha20-Poly1305 note encryption for auditor/holder selective disclosure.
- `index.ts` — `Veil.init()` convenience client (`prepareDeposit`, `commitment`, `nullifierHash`).

## Usage

```ts
import { Veil, generateViewKeyPair, encodeNote, decryptNote } from "@veil/sdk";

const veil = await Veil.init();
const auditor = generateViewKeyPair();                 // held by holder + optional auditor

// Deposit: commitment goes on-chain; note is the spending key (persist it!)
const { note, commitment, encryptedNote } = veil.prepareDeposit(1_000_000n, auditor.publicKey);
// -> pool.deposit(commitment, 1_000_000n, encryptedNote)

// Later, the auditor decrypts for compliance:
const recovered = decryptNote(auditor.secretKey, encryptedNote); // == encodeNote(note)
```

## Test

```bash
npm install
npm test    # vitest: note determinism, Merkle proof verify, ASP membership, view-key round-trip
```

The SDK's Poseidon, `ZERO_VALUE`, and tree algorithm are byte-for-byte consistent with the
on-chain pool, so client-computed commitments/roots match what the contract stores.
