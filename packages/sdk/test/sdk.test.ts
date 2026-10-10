import { describe, it, expect, beforeAll } from "vitest";
import {
  buildVeilPoseidon,
  type Poseidon,
  createNote,
  commitment,
  nullifierHash,
  encodeNote,
  decodeNote,
  VeilMerkleTree,
  AssociationSet,
  generateViewKeyPair,
  encryptNote,
  decryptNote,
  DEFAULT_LEVELS,
} from "../src/index.js";

let p: Poseidon;
beforeAll(async () => {
  p = await buildVeilPoseidon();
});

describe("notes", () => {
  it("commitment and nullifierHash are deterministic and in-field", () => {
    const note = { value: 1_000_000n, nullifier: 7n, secret: 9n };
    const c1 = commitment(p, note);
    const c2 = commitment(p, note);
    expect(c1).to.equal(c2);
    expect(c1).to.be.greaterThan(0n);
    const nh = nullifierHash(p, note);
    expect(nh).to.equal(nullifierHash(p, note));
    expect(nh).to.not.equal(c1);
  });

  it("encode/decode round-trips", () => {
    const note = createNote(123_456_789n);
    expect(decodeNote(encodeNote(note))).to.deep.equal(note);
  });

  it("distinct notes yield distinct commitments", () => {
    const a = createNote(1n);
    const b = createNote(1n);
    expect(commitment(p, a)).to.not.equal(commitment(p, b));
  });
});

describe("merkle tree", () => {
  it("generates proofs that verify against the root", () => {
    const tree = new VeilMerkleTree(p, DEFAULT_LEVELS);
    const leaves = [11n, 22n, 33n, 44n, 55n];
    leaves.forEach((l) => tree.insert(l));
    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.generateProof(i);
      expect(proof.leaf).to.equal(leaves[i]);
      expect(proof.pathElements.length).to.equal(DEFAULT_LEVELS);
      expect(tree.verifyProof(proof)).to.equal(true);
    }
  });

  it("rejects a tampered proof", () => {
    const tree = new VeilMerkleTree(p, DEFAULT_LEVELS, [1n, 2n, 3n]);
    const proof = tree.generateProof(1);
    proof.pathElements[0] = proof.pathElements[0] + 1n;
    expect(tree.verifyProof(proof)).to.equal(false);
  });

  it("root changes as leaves are added", () => {
    const tree = new VeilMerkleTree(p, DEFAULT_LEVELS);
    const empty = tree.root;
    tree.insert(99n);
    expect(tree.root).to.not.equal(empty);
  });
});

describe("association set (proof of innocence)", () => {
  it("proves membership for included commitments only", () => {
    const notes = [createNote(1n), createNote(2n), createNote(3n)];
    const commits = notes.map((n) => commitment(p, n));
    const asp = new AssociationSet(p, DEFAULT_LEVELS, commits.slice(0, 2));

    expect(asp.includes(commits[0])).to.equal(true);
    expect(asp.includes(commits[2])).to.equal(false);

    const proof = asp.proofFor(commits[0]);
    expect(proof.root).to.equal(asp.root);
    expect(() => asp.proofFor(commits[2])).to.throw();
  });
});

describe("view keys", () => {
  it("auditor with the secret key can decrypt; others cannot", () => {
    const auditor = generateViewKeyPair();
    const attacker = generateViewKeyPair();
    const note = createNote(5_000_000n);

    const blob = encryptNote(auditor.publicKey, encodeNote(note));
    expect(decodeNote(decryptNote(auditor.secretKey, blob))).to.deep.equal(note);
    expect(() => decryptNote(attacker.secretKey, blob)).to.throw();
  });
});
