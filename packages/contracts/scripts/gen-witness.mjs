// Generate a real witness, Groth16 proof, and Solidity calldata for one
// deposit→withdraw case, using the @veil/sdk to build the Merkle and
// association-set witnesses exactly as a client would. Outputs land in build/.
import * as snarkjs from "snarkjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVeilPoseidon,
  VeilMerkleTree,
  AssociationSet,
  commitment as commitmentOf,
  nullifierHash as nullifierHashOf,
} from "../../sdk/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, "..", "build");
const LEVELS = 20;

// Deterministic case so the on-chain test can hardcode matching values.
const RECIPIENT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // hardhat #2
const RELAYER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";   // hardhat #3
const value = 1_000_000n; // 1 USDC (6 dp)
const fee = 2_000n;
const note = {
  value,
  nullifier: BigInt("0x" + "11".repeat(31)),
  secret: BigInt("0x" + "22".repeat(31)),
};

const p = await buildVeilPoseidon();
const commitment = commitmentOf(p, note);

const tree = new VeilMerkleTree(p, LEVELS);
tree.insert(commitment);
const tproof = tree.generateProof(0);

const asp = new AssociationSet(p, LEVELS, [commitment]);
const aproof = asp.proofFor(commitment);

const input = {
  root: tree.root.toString(),
  aspRoot: asp.root.toString(),
  nullifierHash: nullifierHashOf(p, note).toString(),
  recipient: BigInt(RECIPIENT).toString(),
  relayer: BigInt(RELAYER).toString(),
  fee: fee.toString(),
  value: value.toString(),
  nullifier: note.nullifier.toString(),
  secret: note.secret.toString(),
  treePathElements: tproof.pathElements.map(String),
  treePathIndices: tproof.pathIndices.map(String),
  aspPathElements: aproof.pathElements.map(String),
  aspPathIndices: aproof.pathIndices.map(String),
};
fs.writeFileSync(path.join(build, "input.json"), JSON.stringify(input, null, 2));

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  path.join(build, "withdraw_js", "withdraw.wasm"),
  path.join(build, "withdraw_final.zkey")
);

const ok = await snarkjs.groth16.verify(
  JSON.parse(fs.readFileSync(path.join(build, "verification_key.json"))),
  publicSignals,
  proof
);
if (!ok) throw new Error("off-chain proof verification failed");

const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
fs.writeFileSync(path.join(build, "calldata.json"), "[" + calldata + "]");
fs.writeFileSync(
  path.join(build, "case.json"),
  JSON.stringify({ recipient: RECIPIENT, relayer: RELAYER, value: value.toString(), fee: fee.toString(), commitment: commitment.toString() }, null, 2)
);
console.log("off-chain proof verified:", ok);
console.log("wrote build/input.json, build/calldata.json, build/case.json");
