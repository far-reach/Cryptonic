# @veil/solana

VEIL confidential stablecoin prototype on Solana Token-2022 Confidential Transfer.

## Why Solana already fits VEIL

Token-2022's **Confidential Transfer** extension encrypts token amounts with ElGamal + ZK
proofs while keeping addresses public, and supports an **issuer-designated auditor key** that
can decrypt amounts for compliance. That auditor key is the direct analog of VEIL's view key —
selective disclosure the issuer/holder grants, not a protocol backdoor. This is the Solana
Foundation's "confidentiality, not anonymity" model.

## What's here

- `src/confidentialMint.ts` — type-checked helper that sizes and initializes a Token-2022 mint
  account for the confidential extension (the part the stable JS SDK can build), with the
  confidential-init step documented for the CLI/Rust path.
- `src/index.ts` — `VEIL_SOLANA_MAPPING`: VEIL concept → Solana confidential-transfer instruction.
- `confidential-payroll.sh` — runnable `spl-token` CLI runbook for the full flow: create a
  confidential mint with an auditor key, shield a balance, pay an employee with the amount
  encrypted on-chain, and have the auditor decrypt it.

## Note on SDK surface

The stable `@solana/spl-token` reserves the `ConfidentialTransferMint` extension type but does
not yet expose its instruction builders; the confidential-transfer flow is driven today via the
`spl-token` CLI or the Rust SDK. The CLI runbook is therefore the executable reference; the TS
module covers the mint scaffolding JS can do and type-checks cleanly.

```bash
npm install
npm run typecheck
# Full flow needs a funded devnet keypair + spl-token CLI:
CLUSTER=https://api.devnet.solana.com EMPLOYEE_ATA=<ata> bash confidential-payroll.sh
```
