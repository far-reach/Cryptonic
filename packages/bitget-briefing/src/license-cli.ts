#!/usr/bin/env node
/**
 * Vendor tooling for the freemium model — generate the signing keypair and
 * issue/inspect customer license keys. Customers never need this; they just
 * set BRIEFING_LICENSE_KEY. See docs/pricing.md.
 *
 *   license-cli keygen
 *       Print a fresh Ed25519 keypair. Ship the public key (VENDOR_PUBLIC_KEY_B64
 *       in license.ts, or the BRIEFING_LICENSE_PUBLIC_KEY env var); keep the
 *       private key in your secret manager.
 *
 *   license-cli issue --key <privateKeyB64> --plan pro|desk [--email a@b] [--days 365]
 *       Sign a license key for a customer (default validity 365 days).
 *
 *   license-cli verify <licenseKey> [--public-key <spkiB64>]
 *       Check a key offline and print its claims.
 */
import { generateLicenseKeypair, issueLicenseKey, verifyLicenseKey } from "./license.js";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv: string[]): number {
  const [cmd, ...args] = argv;

  if (cmd === "keygen") {
    const { publicKey, privateKey } = generateLicenseKeypair();
    console.log(`public key  (ship it):     ${publicKey}`);
    console.log(`private key (KEEP SECRET): ${privateKey}`);
    return 0;
  }

  if (cmd === "issue") {
    const key = opt(args, "--key");
    const plan = opt(args, "--plan");
    const email = opt(args, "--email");
    const days = Number(opt(args, "--days") ?? 365);
    if (!key || (plan !== "pro" && plan !== "desk") || !Number.isFinite(days) || days <= 0) {
      console.error("usage: license-cli issue --key <privateKeyB64> --plan pro|desk [--email a@b] [--days 365]");
      return 1;
    }
    const now = Date.now();
    console.log(
      issueLicenseKey(
        { plan, ...(email ? { email } : {}), issuedAt: now, expiresAt: now + days * 86_400_000 },
        key,
      ),
    );
    return 0;
  }

  if (cmd === "verify") {
    const [license] = args;
    if (!license) {
      console.error("usage: license-cli verify <licenseKey> [--public-key <spkiB64>]");
      return 1;
    }
    const status = verifyLicenseKey(license, { publicKey: opt(args, "--public-key") });
    if (status.state === "invalid") {
      console.error(`invalid: ${status.reason}`);
      return 1;
    }
    const c = status.claims;
    console.log(
      `${status.state}: plan=${c.plan}${c.email ? ` email=${c.email}` : ""} ` +
        `expires=${new Date(c.expiresAt).toISOString().slice(0, 10)}`,
    );
    return status.state === "expired" ? 1 : 0;
  }

  console.error("usage: license-cli <keygen|issue|verify> …  (see file header)");
  return 1;
}

process.exit(main(process.argv.slice(2)));
