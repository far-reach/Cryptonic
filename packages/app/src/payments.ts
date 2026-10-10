import { hexlify, getBytes, type Contract } from "ethers";
import {
  createNote,
  commitment as commitmentOf,
  encodeNote,
  decodeNote,
  encryptNote,
  decryptNote,
  type Poseidon,
  type Note,
  type AssociationSet,
} from "../../sdk/dist/index.js";
import { Relayer } from "../../services/dist/index.js";
import { VeilWallet } from "./wallet.js";

/**
 * PaymentsClient — the product surface a business integrates.
 *
 *   shield(amount)  → move stablecoins into the confidential pool (a private balance)
 *   pay(note, to)   → pay someone privately; the relayer proves + submits (gasless)
 *   audit(cipher)   → decrypt a note with the view key for the books / an auditor
 *
 * Wraps the pool contract, the SDK, and the relayer so app code never touches
 * commitments, Merkle proofs, or the proving toolchain directly.
 */
export class PaymentsClient {
  constructor(
    private readonly pool: Contract,
    private readonly token: Contract,
    private readonly poseidon: Poseidon,
    readonly wallet: VeilWallet
  ) {}

  /**
   * Shield `amount` into the pool. Encrypts the note to `auditorPublicKey`
   * (defaults to the wallet's own view key) so it can later be audited.
   */
  async shield(amount: bigint, auditorPublicKey?: Uint8Array): Promise<{ note: Note; commitment: bigint }> {
    const note = createNote(amount);
    const commitment = commitmentOf(this.poseidon, note);
    const encrypted = hexlify(encryptNote(auditorPublicKey ?? this.wallet.viewKey.publicKey, encodeNote(note)));

    const poolAddr = await this.pool.getAddress();
    await (await this.token.approve(poolAddr, amount)).wait();
    await (await this.pool.deposit(commitment, amount, encrypted)).wait();

    this.wallet.add(note, commitment);
    return { note, commitment };
  }

  /**
   * Pay `recipient` privately from a shielded `note`, via a relayer that generates
   * the proof and submits the transaction. `fee` is the relayer's cut.
   */
  async pay(
    note: Note,
    recipient: string,
    relayer: Relayer,
    approvedSet: AssociationSet,
    fee: bigint
  ): Promise<unknown> {
    const receipt = await relayer.relayWithdraw(note, recipient, approvedSet, fee);
    this.wallet.markSpent(commitmentOf(this.poseidon, note));
    return receipt;
  }

  /** Decrypt an on-chain note ciphertext with the wallet's view key. */
  audit(encryptedNoteHex: string): Note {
    return decodeNote(decryptNote(this.wallet.viewKey.secretKey, getBytes(encryptedNoteHex)));
  }

  /** Local shielded balance (sum of unspent notes). */
  balance(): bigint {
    return this.wallet.balance();
  }
}
