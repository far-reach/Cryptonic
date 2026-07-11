#!/usr/bin/env bash
# VEIL — confidential payroll on Solana (Token-2022 Confidential Transfer).
#
# Runnable reference for the full confidential-payment flow using the `spl-token`
# CLI (the supported path today; the stable JS SDK does not yet expose the
# confidential-transfer instructions). Demonstrates VEIL's core promise: a business
# pays an employee in a stablecoin where the AMOUNT is hidden on-chain, yet a
# designated AUDITOR can decrypt it for compliance — "confidentiality, not anonymity".
#
# Requires: solana CLI + spl-token CLI (Agave 2.x), a funded devnet keypair.
# This script is NOT run in CI (it needs a live validator); it is the operator runbook.
set -euo pipefail

CLUSTER="${CLUSTER:-https://api.devnet.solana.com}"
solana config set --url "$CLUSTER"

echo "== 1. Auditor key: the compliance 'view key' =="
# The auditor ElGamal keypair can decrypt every confidential amount on this mint.
# The issuer holds it (or hands it to a regulator/auditor). Losing it loses audit
# ability, NOT custody — it cannot move funds.
solana-keygen new --no-bip39-passphrase --force -o auditor-elgamal.json
AUDITOR_ELGAMAL_PUBKEY="$(solana-keygen pubkey auditor-elgamal.json)"
echo "auditor elgamal pubkey: $AUDITOR_ELGAMAL_PUBKEY"

echo "== 2. Create the confidential stablecoin mint (6 decimals) =="
# --enable-confidential-transfers auto  → new accounts auto-approved
# --auditor-pubkey                      → issuer-designated auditor (VEIL view key)
MINT="$(spl-token create-token \
  --program-2022 \
  --decimals 6 \
  --enable-confidential-transfers auto \
  --auditor-pubkey "$AUDITOR_ELGAMAL_PUBKEY" \
  --output json | tee /dev/stderr | grep -oE '"address": "[^"]+"' | head -1 | cut -d'"' -f4)"
echo "mint: $MINT"

echo "== 3. Employer + employee accounts, configured for confidential balances =="
spl-token create-account "$MINT"
spl-token configure-confidential-transfer-account --address "$(spl-token address --token "$MINT" --verbose --output json | grep -oE '"associatedTokenAddress": "[^"]+"' | cut -d'"' -f4)"

echo "== 4. Mint public supply to the employer, then shield it =="
spl-token mint "$MINT" 10000
# Move 10,000 tokens from the public balance into the confidential (encrypted) balance.
spl-token deposit-confidential-tokens "$MINT" 10000
spl-token apply-pending-balance "$MINT"

echo "== 5. Pay the employee confidentially =="
# EMPLOYEE_ATA must be a confidential-configured account owned by the employee.
: "${EMPLOYEE_ATA:?set EMPLOYEE_ATA to the employee's confidential token account}"
# The transfer amount (e.g. 4200) is encrypted on-chain; observers see a transfer
# occurred but not how much. Range + validity ZK proofs are generated client-side.
spl-token transfer "$MINT" 4200 "$EMPLOYEE_ATA" --confidential

echo "== 6. Auditor decrypts the amount for compliance =="
# Only the holder of auditor-elgamal.json can do this. This is the selective
# disclosure that satisfies auditors/regulators without a protocol backdoor.
echo "Auditor uses the auditor ElGamal secret to decrypt the transfer amounts."
echo "(CLI/Rust: spl_token_confidential_transfer_proof_extraction + ElGamal decrypt.)"

echo "Done. On-chain: addresses visible, amounts encrypted, auditor-decryptable."
