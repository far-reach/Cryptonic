import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

/**
 * VEIL on Solana — confidential stablecoin mint scaffolding.
 *
 * Solana already ships the primitive VEIL needs on the EVM side: the Token-2022
 * Confidential Transfer extension encrypts token amounts with ElGamal + ZK proofs
 * while keeping addresses visible, and supports an ISSUER-DESIGNATED AUDITOR KEY
 * that can decrypt amounts for compliance. That auditor key is the direct analog
 * of VEIL's view key: selective disclosure the issuer/holder grants, not a
 * protocol backdoor. This is exactly the "confidentiality, not anonymity" model
 * the Solana Foundation ships in its institutional privacy framework.
 *
 * NOTE ON SDK SURFACE: the stable @solana/spl-token JS SDK reserves the
 * ConfidentialTransferMint extension TYPE but does not yet expose its instruction
 * builders (InitializeMint-with-auditor, ConfigureAccount, Deposit,
 * ApplyPendingBalance, Transfer-with-proofs). Those are driven today via the
 * `spl-token` CLI or the Rust SDK — see `confidential-payroll.sh` for the full,
 * runnable flow. This module builds the parts JS can do correctly: allocating a
 * mint account sized for the confidential extension and initializing the base
 * mint. The confidential-extension init instruction must be prepended via the
 * CLI/Rust path before `InitializeMint` on-chain.
 */

/** Byte length of a Token-2022 mint account carrying the confidential extension. */
export function confidentialMintLen(): number {
  return getMintLen([ExtensionType.ConfidentialTransferMint]);
}

export interface ConfidentialMintPlan {
  /** Partially-built transaction: create account (sized) + initialize base mint. */
  transaction: Transaction;
  /** Lamports required to rent-exempt the sized mint account. */
  lamports: number;
  mintLen: number;
}

/**
 * Build the account-creation + base mint-init transaction for a confidential
 * stablecoin mint. The caller must insert the confidential-transfer init
 * instruction (with the auditor ElGamal pubkey) between these two, using the
 * Rust SDK / CLI, before submitting.
 */
export async function planConfidentialMint(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  decimals = 6
): Promise<ConfidentialMintPlan> {
  const mintLen = confidentialMintLen();
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // <-- Insert here (CLI/Rust): ConfidentialTransferInstruction::InitializeMint
    //     { authority, auto_approve_new_accounts, auditor_elgamal_pubkey }.
    createInitializeMintInstruction(
      mint,
      decimals,
      mintAuthority,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  return { transaction: tx, lamports, mintLen };
}

/** Convenience for tests/scripts: a fresh mint keypair. */
export function newMintKeypair(): Keypair {
  return Keypair.generate();
}
