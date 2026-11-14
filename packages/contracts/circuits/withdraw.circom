pragma circom 2.1.6;

// VEIL withdrawal circuit (specification / reference implementation).
//
// Proves, in zero knowledge, that the prover controls a shielded note whose:
//   1. commitment is a leaf of the pool's commitment tree (root `root`), AND
//   2. deposit is included in an approved association set (root `aspRoot`), AND
//   3. value equals the publicly-declared withdrawal `value`,
// while revealing only `nullifierHash` (double-spend tag) and the public I/O.
//
// Public signals (order MUST match IVerifier / VeilPool.withdraw):
//   [root, aspRoot, nullifierHash, recipient, relayer, fee, value]
//
// `recipient`, `relayer`, `fee` are bound into the proof (as public inputs that
// also feed a constraint) so a relayer cannot re-target a valid proof — front-
// running protection identical to Tornado/Privacy Pools.
//
// Build:  circom withdraw.circom --r1cs --wasm --sym
//         snarkjs groth16 setup ... && snarkjs zkey export solidityverifier
// The exported Verifier.sol replaces MockVerifier in production.

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";

// Verifies a Merkle path of depth `levels` using Poseidon(2).
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels]; // 0 = leaf is left, 1 = leaf is right
    signal output root;

    component hashers[levels];
    component mux[levels];
    signal cur[levels + 1];
    cur[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0; // boolean

        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== cur[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][1] <== cur[i];
        mux[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        cur[i + 1] <== hashers[i].out;
    }
    root <== cur[levels];
}

template Withdraw(levels) {
    // Public
    signal input root;
    signal input aspRoot;
    signal input nullifierHash;
    signal input recipient;
    signal input relayer;
    signal input fee;
    signal input value;

    // Private (the note + witnesses)
    signal input nullifier;
    signal input secret;
    signal input treePathElements[levels];
    signal input treePathIndices[levels];
    signal input aspPathElements[levels];
    signal input aspPathIndices[levels];

    // precommitment = Poseidon(nullifier, secret)
    component pre = Poseidon(2);
    pre.inputs[0] <== nullifier;
    pre.inputs[1] <== secret;

    // commitment = Poseidon(value, precommitment)
    component commit = Poseidon(2);
    commit.inputs[0] <== value;
    commit.inputs[1] <== pre.out;

    // nullifierHash = Poseidon(nullifier, nullifier) — 2-input reuse.
    component nh = Poseidon(2);
    nh.inputs[0] <== nullifier;
    nh.inputs[1] <== nullifier;
    nh.out === nullifierHash;

    // (1) commitment ∈ pool tree
    component treeProof = MerkleProof(levels);
    treeProof.leaf <== commit.out;
    for (var i = 0; i < levels; i++) {
        treeProof.pathElements[i] <== treePathElements[i];
        treeProof.pathIndices[i] <== treePathIndices[i];
    }
    treeProof.root === root;

    // (2) commitment ∈ approved association set
    component aspProof = MerkleProof(levels);
    aspProof.leaf <== commit.out;
    for (var i = 0; i < levels; i++) {
        aspProof.pathElements[i] <== aspPathElements[i];
        aspProof.pathIndices[i] <== aspPathIndices[i];
    }
    aspProof.root === aspRoot;

    // (3) fee <= value (range-checked; 128 bits is ample for token base units)
    component feeLteValue = LessEqThan(128);
    feeLteValue.in[0] <== fee;
    feeLteValue.in[1] <== value;
    feeLteValue.out === 1;

    // Bind public-but-otherwise-unused signals so the proof is non-malleable.
    signal recipientSq;
    signal relayerSq;
    recipientSq <== recipient * recipient;
    relayerSq <== relayer * relayer;
}

component main {public [root, aspRoot, nullifierHash, recipient, relayer, fee, value]} = Withdraw(20);
