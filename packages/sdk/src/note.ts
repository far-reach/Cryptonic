import { randomBytes } from "@noble/hashes/utils";
import { FIELD_SIZE } from "./constants.js";
import type { Poseidon } from "./poseidon.js";

/** A shielded note. `value` is public at deposit; `nullifier`/`secret` are private. */
export interface Note {
  value: bigint;
  nullifier: bigint;
  secret: bigint;
}

function randomFieldElement(): bigint {
  // 31 bytes < 2^248 < FIELD_SIZE, so always a valid field element without bias-retry.
  return bytesToBigInt(randomBytes(31));
}

function bytesToBigInt(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

function bigIntTo32Bytes(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Create a fresh note for `value` base units (e.g. USDC has 6 decimals). */
export function createNote(value: bigint): Note {
  if (value <= 0n || value >= FIELD_SIZE) throw new Error("invalid value");
  return { value, nullifier: randomFieldElement(), secret: randomFieldElement() };
}

/** precommitment = Poseidon(nullifier, secret) */
export function precommitment(p: Poseidon, note: Note): bigint {
  return p.hash2(note.nullifier, note.secret);
}

/** commitment = Poseidon(value, precommitment) — the tree leaf. */
export function commitment(p: Poseidon, note: Note): bigint {
  return p.hash2(note.value, precommitment(p, note));
}

/** nullifierHash = Poseidon(nullifier, nullifier) — the public double-spend tag. */
export function nullifierHash(p: Poseidon, note: Note): bigint {
  return p.hash1(note.nullifier);
}

/** Fixed 96-byte encoding (value ‖ nullifier ‖ secret) for view-key encryption. */
export function encodeNote(note: Note): Uint8Array {
  const out = new Uint8Array(96);
  out.set(bigIntTo32Bytes(note.value), 0);
  out.set(bigIntTo32Bytes(note.nullifier), 32);
  out.set(bigIntTo32Bytes(note.secret), 64);
  return out;
}

export function decodeNote(bytes: Uint8Array): Note {
  if (bytes.length !== 96) throw new Error("bad note encoding");
  return {
    value: bytesToBigInt(bytes.slice(0, 32)),
    nullifier: bytesToBigInt(bytes.slice(32, 64)),
    secret: bytesToBigInt(bytes.slice(64, 96)),
  };
}
