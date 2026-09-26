export * from "./constants.js";
export * from "./poseidon.js";
export * from "./note.js";
export * from "./merkle.js";
export * from "./asp.js";
export * from "./viewkey.js";

import { buildVeilPoseidon, type Poseidon } from "./poseidon.js";
import {
  createNote,
  commitment,
  nullifierHash,
  encodeNote,
  type Note,
} from "./note.js";
import { encryptNote } from "./viewkey.js";

/**
 * Convenience client bound to a ready Poseidon instance.
 *
 *   const veil = await Veil.init();
 *   const { note, commitment, encryptedNote } = veil.prepareDeposit(1_000_000n, auditorPubKey);
 *   // call pool.deposit(commitment, value, encryptedNote)
 */
export class Veil {
  private constructor(readonly poseidon: Poseidon) {}

  static async init(): Promise<Veil> {
    return new Veil(await buildVeilPoseidon());
  }

  /**
   * Build the arguments for a shielded deposit. The note MUST be persisted by the
   * depositor (it is the spending key); `encryptedNote` additionally lets any
   * holder of `viewPublicKey`'s secret decrypt it for audit.
   */
  prepareDeposit(
    value: bigint,
    viewPublicKey: Uint8Array
  ): { note: Note; commitment: bigint; encryptedNote: Uint8Array } {
    const note = createNote(value);
    return {
      note,
      commitment: commitment(this.poseidon, note),
      encryptedNote: encryptNote(viewPublicKey, encodeNote(note)),
    };
  }

  commitment(note: Note): bigint {
    return commitment(this.poseidon, note);
  }

  nullifierHash(note: Note): bigint {
    return nullifierHash(this.poseidon, note);
  }
}
