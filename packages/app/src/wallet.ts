import {
  generateViewKeyPair,
  type ViewKeyPair,
  type Note,
} from "../../sdk/dist/index.js";

export interface StoredNote {
  note: Note;
  commitment: bigint;
  spent: boolean;
}

const toHex = (b: Uint8Array) => "0x" + Buffer.from(b).toString("hex");
const fromHex = (s: string) => new Uint8Array(Buffer.from(s.replace(/^0x/, ""), "hex"));

/**
 * A business's local VEIL wallet. Holds the view key (which it can share with an
 * auditor) and the notes that are the spending secrets for its shielded balance.
 * Notes MUST be persisted — losing a note loses the funds. Serialization keeps
 * bigints as decimal strings and keys as hex so it round-trips through JSON.
 */
export class VeilWallet {
  viewKey: ViewKeyPair;
  notes: StoredNote[] = [];

  constructor(viewKey?: ViewKeyPair) {
    this.viewKey = viewKey ?? generateViewKeyPair();
  }

  add(note: Note, commitment: bigint): void {
    this.notes.push({ note, commitment, spent: false });
  }

  markSpent(commitment: bigint): void {
    const s = this.notes.find((n) => n.commitment === commitment);
    if (s) s.spent = true;
  }

  unspent(): StoredNote[] {
    return this.notes.filter((n) => !n.spent);
  }

  /** Total shielded balance across unspent notes (token base units). */
  balance(): bigint {
    return this.unspent().reduce((acc, n) => acc + n.note.value, 0n);
  }

  toJSON(): string {
    return JSON.stringify({
      viewKey: { secretKey: toHex(this.viewKey.secretKey), publicKey: toHex(this.viewKey.publicKey) },
      notes: this.notes.map((n) => ({
        value: n.note.value.toString(),
        nullifier: n.note.nullifier.toString(),
        secret: n.note.secret.toString(),
        commitment: n.commitment.toString(),
        spent: n.spent,
      })),
    });
  }

  static fromJSON(json: string): VeilWallet {
    const d = JSON.parse(json);
    const w = new VeilWallet({
      secretKey: fromHex(d.viewKey.secretKey),
      publicKey: fromHex(d.viewKey.publicKey),
    });
    w.notes = d.notes.map((n: any) => ({
      note: { value: BigInt(n.value), nullifier: BigInt(n.nullifier), secret: BigInt(n.secret) },
      commitment: BigInt(n.commitment),
      spent: !!n.spent,
    }));
    return w;
  }
}
