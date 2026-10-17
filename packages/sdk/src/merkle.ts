import { ZERO_VALUE } from "./constants.js";
import type { Poseidon } from "./poseidon.js";

export interface MerkleProof {
  leaf: bigint;
  pathElements: bigint[];
  pathIndices: number[]; // 0 = current node is the left child (matches withdraw.circom)
  root: bigint;
}

/**
 * Fixed-depth Poseidon Merkle tree matching MerkleTreeWithHistory.sol and
 * withdraw.circom. Used both for the pool's commitment tree and for building
 * association sets (proof of innocence). Recomputes layers on demand — fine for
 * prototype scale; a production indexer would keep the tree incrementally.
 */
export class VeilMerkleTree {
  readonly levels: number;
  private readonly p: Poseidon;
  private readonly zeros: bigint[] = [];
  private _leaves: bigint[] = [];

  constructor(p: Poseidon, levels: number, leaves: bigint[] = []) {
    this.p = p;
    this.levels = levels;
    let z = ZERO_VALUE;
    this.zeros.push(z);
    for (let i = 1; i < levels; i++) {
      z = p.hash2(z, z);
      this.zeros.push(z);
    }
    this._leaves = [...leaves];
  }

  get leaves(): readonly bigint[] {
    return this._leaves;
  }

  insert(leaf: bigint): number {
    if (this._leaves.length >= 2 ** this.levels) throw new Error("tree full");
    this._leaves.push(leaf);
    return this._leaves.length - 1;
  }

  indexOf(leaf: bigint): number {
    return this._leaves.findIndex((l) => l === leaf);
  }

  get root(): bigint {
    let layer = [...this._leaves];
    for (let level = 0; level < this.levels; level++) {
      const next: bigint[] = [];
      for (let i = 0; i < layer.length || i === 0; i += 2) {
        const left = layer[i] ?? this.zeros[level];
        const right = layer[i + 1] ?? this.zeros[level];
        next.push(this.p.hash2(left, right));
        if (i + 2 >= layer.length) break;
      }
      layer = next.length ? next : [this.p.hash2(this.zeros[level], this.zeros[level])];
    }
    return layer[0];
  }

  generateProof(index: number): MerkleProof {
    if (index < 0 || index >= this._leaves.length) throw new Error("index out of range");
    const leaf = this._leaves[index];
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let layer = [...this._leaves];
    let idx = index;
    for (let level = 0; level < this.levels; level++) {
      const siblingIdx = idx ^ 1;
      const sibling = layer[siblingIdx] ?? this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(idx & 1);
      const next: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i] ?? this.zeros[level];
        const right = layer[i + 1] ?? this.zeros[level];
        next.push(this.p.hash2(left, right));
      }
      layer = next;
      idx >>= 1;
    }
    return { leaf, pathElements, pathIndices, root: this.root };
  }

  verifyProof(proof: MerkleProof): boolean {
    let cur = proof.leaf;
    for (let i = 0; i < proof.pathElements.length; i++) {
      cur =
        proof.pathIndices[i] === 0
          ? this.p.hash2(cur, proof.pathElements[i])
          : this.p.hash2(proof.pathElements[i], cur);
    }
    return cur === proof.root;
  }
}
