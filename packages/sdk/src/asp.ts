import { VeilMerkleTree, type MerkleProof } from "./merkle.js";
import type { Poseidon } from "./poseidon.js";

/**
 * Association Set Provider helper.
 *
 * An ASP curates the set of deposit commitments it is willing to vouch for
 * (proof of innocence). It publishes the Merkle root of that set on-chain via
 * AssociationSetRegistry, and the public inclusion list off-chain (e.g. IPFS) so
 * anyone can reconstruct and audit the root. A withdrawer proves their
 * commitment is in this set without revealing which one — "confidentiality, not
 * anonymity".
 *
 * This is deliberately policy-agnostic: an ASP might include every commitment
 * except those linked to sanctioned addresses, or take an allowlist approach for
 * a permissioned enterprise deployment. VEIL supports many competing ASPs; users
 * pick which compliance attestation they want to carry.
 */
export class AssociationSet {
  private readonly tree: VeilMerkleTree;

  constructor(p: Poseidon, levels: number, approvedCommitments: bigint[] = []) {
    this.tree = new VeilMerkleTree(p, levels, approvedCommitments);
  }

  add(commitment: bigint): number {
    return this.tree.insert(commitment);
  }

  get root(): bigint {
    return this.tree.root;
  }

  get size(): number {
    return this.tree.leaves.length;
  }

  includes(commitment: bigint): boolean {
    return this.tree.indexOf(commitment) !== -1;
  }

  /** Membership proof for `commitment`; throws if not in the approved set. */
  proofFor(commitment: bigint): MerkleProof {
    const idx = this.tree.indexOf(commitment);
    if (idx === -1) throw new Error("commitment not in association set");
    return this.tree.generateProof(idx);
  }
}
