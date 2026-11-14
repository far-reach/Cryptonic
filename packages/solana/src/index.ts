export * from "./confidentialMint.js";

/**
 * Maps a VEIL concept to its Solana Confidential Transfer realization.
 * Documentation-only helper so the parallel between the two chains is explicit.
 */
export const VEIL_SOLANA_MAPPING = {
  viewKey: "auditor ElGamal keypair (ConfidentialTransferMint.auditor_elgamal_pubkey)",
  shieldedAmount: "ElGamal-encrypted available/pending balance on the token account",
  deposit: "ConfidentialTransfer Deposit + ApplyPendingBalance",
  privateTransfer: "ConfidentialTransfer Transfer with range + validity ZK proofs",
  proofOfInnocence:
    "off-chain association-set attestation; on Solana enforced by auto_approve / allowlist policy at the mint",
  complianceModel: "confidentiality, not anonymity — addresses public, amounts private, auditor can decrypt",
} as const;
