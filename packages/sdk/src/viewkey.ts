import { x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

/**
 * View keys — the mechanism that makes VEIL auditable without a backdoor.
 *
 * At deposit time the sender encrypts the note under a viewing public key. Whoever
 * holds the matching secret key (the depositor themselves, and — if they choose to
 * share it — their auditor or a tax authority) can decrypt the note and see the
 * amount and its later spend. Nobody else can. This is selective disclosure the
 * account holder grants, not a master key the protocol holds.
 *
 * Scheme: ephemeral-static X25519 ECDH → SHA-256(shared) → XChaCha20-Poly1305.
 * Blob layout: ephemeralPubKey(32) ‖ nonce(24) ‖ ciphertext(+16 tag).
 */
export interface ViewKeyPair {
  secretKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 32 bytes
}

export function generateViewKeyPair(): ViewKeyPair {
  const secretKey = x25519.utils.randomSecretKey();
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function viewPublicKey(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

export function encryptNote(recipientPublicKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const ephSecret = x25519.utils.randomSecretKey();
  const ephPublic = x25519.getPublicKey(ephSecret);
  const shared = x25519.getSharedSecret(ephSecret, recipientPublicKey);
  const key = sha256(shared);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);

  const blob = new Uint8Array(32 + 24 + ct.length);
  blob.set(ephPublic, 0);
  blob.set(nonce, 32);
  blob.set(ct, 56);
  return blob;
}

export function decryptNote(secretKey: Uint8Array, blob: Uint8Array): Uint8Array {
  if (blob.length < 56 + 16) throw new Error("blob too short");
  const ephPublic = blob.slice(0, 32);
  const nonce = blob.slice(32, 56);
  const ct = blob.slice(56);
  const shared = x25519.getSharedSecret(secretKey, ephPublic);
  const key = sha256(shared);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}
