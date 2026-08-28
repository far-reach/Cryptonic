/**
 * Offline license keys for the paid tiers.
 *
 * A license key is `veil1.<payload>.<signature>`: a base64url JSON payload
 * (plan, optional email, issued/expiry timestamps) signed with the vendor's
 * Ed25519 key. Verification is fully offline against the vendor public key —
 * no license server, no phone-home, no telemetry. The bot never blocks on
 * licensing: a bad or expired key just resolves to the free tier (see
 * subscription.ts), and expiry has a grace window so a lapsed renewal never
 * silences a delisting warning on the day it matters.
 *
 * Vendor side: `license-cli.ts` generates the keypair and issues keys. The
 * private key lives in the vendor's secret manager, never in this repo.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { PlanId } from "./plans.js";
import { isPlanId } from "./plans.js";

export const LICENSE_PREFIX = "veil1";

/**
 * Default trusted vendor public key (SPKI, base64). The matching private key
 * was generated out-of-band and is not in this repository. Replace at release
 * time via `license-cli keygen`, or override per-deployment with the
 * BRIEFING_LICENSE_PUBLIC_KEY env var (see subscription.ts).
 */
export const VENDOR_PUBLIC_KEY_B64 =
  "MCowBQYDK2VwAyEAP3/Luvy9EV/HGHPfoyr16IX/lNRF2F/sEt5n8SQeDS8=";

/** Days after expiry during which a license still resolves to its plan. */
export const LICENSE_GRACE_DAYS = 7;

export interface LicenseClaims {
  plan: Exclude<PlanId, "free">;
  /** Licensee identity (email) — attribution only, never sent anywhere. */
  email?: string;
  /** Issued-at, ms since epoch. */
  issuedAt: number;
  /** Expiry, ms since epoch. */
  expiresAt: number;
}

export type LicenseStatus =
  | { state: "valid"; claims: LicenseClaims }
  | { state: "grace"; claims: LicenseClaims; daysPastExpiry: number }
  | { state: "expired"; claims: LicenseClaims }
  | { state: "invalid"; reason: string };

interface WireClaims {
  p: string;
  e?: string;
  iat: number;
  exp: number;
}

const toPublicKey = (b64: string) =>
  createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
const toPrivateKey = (b64: string) =>
  createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });

/** Vendor tooling: one Ed25519 keypair, DER as base64 (SPKI public, PKCS8 private). */
export function generateLicenseKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

/** Vendor tooling: sign a license key for a customer. */
export function issueLicenseKey(claims: LicenseClaims, privateKeyB64: string): string {
  const wire: WireClaims = {
    p: claims.plan,
    ...(claims.email ? { e: claims.email } : {}),
    iat: Math.round(claims.issuedAt / 1000),
    exp: Math.round(claims.expiresAt / 1000),
  };
  const payload = Buffer.from(JSON.stringify(wire), "utf8");
  const sig = sign(null, payload, toPrivateKey(privateKeyB64));
  return `${LICENSE_PREFIX}.${payload.toString("base64url")}.${sig.toString("base64url")}`;
}

/**
 * Verify a license key offline. Never throws — malformed input, a bad
 * signature, or an unknown plan all come back as `{ state: "invalid" }`.
 */
export function verifyLicenseKey(
  key: string,
  opts: { publicKey?: string; now?: number } = {},
): LicenseStatus {
  const now = opts.now ?? Date.now();
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return { state: "invalid", reason: `not a ${LICENSE_PREFIX} license key` };
  }
  let payload: Buffer;
  let sig: Buffer;
  let wire: WireClaims;
  try {
    payload = Buffer.from(parts[1], "base64url");
    sig = Buffer.from(parts[2], "base64url");
    wire = JSON.parse(payload.toString("utf8")) as WireClaims;
  } catch {
    return { state: "invalid", reason: "malformed key" };
  }
  try {
    if (!verify(null, payload, toPublicKey(opts.publicKey ?? VENDOR_PUBLIC_KEY_B64), sig)) {
      return { state: "invalid", reason: "signature check failed" };
    }
  } catch {
    return { state: "invalid", reason: "signature check failed" };
  }
  if (!isPlanId(wire.p) || wire.p === "free" || !Number.isFinite(wire.exp)) {
    return { state: "invalid", reason: "unrecognized license contents" };
  }
  const claims: LicenseClaims = {
    plan: wire.p,
    ...(typeof wire.e === "string" ? { email: wire.e } : {}),
    issuedAt: (Number.isFinite(wire.iat) ? wire.iat : 0) * 1000,
    expiresAt: wire.exp * 1000,
  };
  if (now <= claims.expiresAt) return { state: "valid", claims };
  const daysPastExpiry = (now - claims.expiresAt) / 86_400_000;
  if (daysPastExpiry <= LICENSE_GRACE_DAYS) {
    return { state: "grace", claims, daysPastExpiry: Math.ceil(daysPastExpiry) };
  }
  return { state: "expired", claims };
}
