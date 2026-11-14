import * as snarkjs from "snarkjs";
import {
  nullifierHash as nullifierHashOf,
  type Note,
  type Poseidon,
  type MerkleProof,
} from "../../sdk/dist/index.js";

/** Solidity-ready Groth16 proof + public signals for VeilPool.withdraw. */
export interface Groth16Calldata {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicSignals: string[]; // [root, aspRoot, nullifierHash, recipient, relayer, fee, value]
}

export interface ProveWithdrawInputs {
  note: Note;
  recipient: string; // 0x address
  relayer: string; // 0x address
  fee: bigint;
  poolProof: MerkleProof;
  aspProof: MerkleProof;
  wasmPath: string;
  zkeyPath: string;
  poseidon: Poseidon;
}

/**
 * Generate a real Groth16 withdrawal proof. This is what the relayer runs on the
 * user's behalf — the user never needs the proving toolchain or gas.
 */
export async function proveWithdraw(inp: ProveWithdrawInputs): Promise<Groth16Calldata> {
  const { note, poseidon } = inp;
  const input = {
    root: inp.poolProof.root.toString(),
    aspRoot: inp.aspProof.root.toString(),
    nullifierHash: nullifierHashOf(poseidon, note).toString(),
    recipient: BigInt(inp.recipient).toString(),
    relayer: BigInt(inp.relayer).toString(),
    fee: inp.fee.toString(),
    value: note.value.toString(),
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    treePathElements: inp.poolProof.pathElements.map(String),
    treePathIndices: inp.poolProof.pathIndices.map(String),
    aspPathElements: inp.aspProof.pathElements.map(String),
    aspPathIndices: inp.aspProof.pathIndices.map(String),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    inp.wasmPath,
    inp.zkeyPath
  );
  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [a, b, c, pub] = JSON.parse("[" + raw + "]");
  return { a, b, c, publicSignals: pub };
}
