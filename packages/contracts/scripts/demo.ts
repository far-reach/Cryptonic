import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import {
  buildVeilPoseidon,
  AssociationSet,
  DEFAULT_LEVELS,
} from "../../sdk/dist/index.js";
import { Relayer } from "../../services/dist/index.js";
import { PaymentsClient, VeilWallet } from "../../app/dist/index.js";

// Live demonstration of a confidential payment against a deployed stack:
//   business shields USDC -> ASP publishes the approved set -> relayer pays a
//   supplier privately with a REAL proof -> auditor decrypts the amount.
// Run against `deployments/<network>.json` produced by scripts/deploy.ts.
const cRoot = path.join(__dirname, "..");
const wasmPath = path.join(cRoot, "build", "withdraw_js", "withdraw.wasm");
const zkeyPath = path.join(cRoot, "build", "withdraw_final.zkey");

const usdcFmt = (v: bigint) => `${ethers.formatUnits(v, 6)} USDC`;

async function main() {
  const file = path.join(cRoot, "..", "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`no deployment for ${network.name}; run scripts/deploy.ts first`);
  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = dep.contracts;
  if (dep.verifier !== "Groth16Verifier") {
    throw new Error("demo needs the real Groth16Verifier — build the circuit and redeploy");
  }
  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    throw new Error("circuit artifacts missing — run scripts/build-circuit.sh");
  }

  const [deployer, business, supplier, relayerOp] = await ethers.getSigners();
  const poseidon = await buildVeilPoseidon();

  const usdc = await ethers.getContractAt("MockERC20", c.usdc);
  const pool = await ethers.getContractAt("VeilPool", c.pool);
  const asp = await ethers.getContractAt("AssociationSetRegistry", c.associationSetRegistry);

  console.log(`\nVEIL confidential payment demo — network: ${network.name}`);
  console.log(`pool: ${c.pool}\n`);

  // The business shields 1,000 USDC.
  const amount = 1_000_000_000n;
  await (await usdc.mint(business.address, amount)).wait();
  const wallet = new VeilWallet();
  const client = new PaymentsClient(pool.connect(business) as any, usdc.connect(business) as any, poseidon, wallet);
  const { commitment } = await client.shield(amount);
  console.log(`1. business shielded ${usdcFmt(amount)} (balance now private)`);
  console.log(`   on-chain you can see a deposit occurred, not who or the link to any withdrawal`);

  // The ASP screens deposits and publishes the approved-set root.
  const set = new AssociationSet(poseidon, DEFAULT_LEVELS, [commitment]);
  await (await asp.connect(deployer).publishRoot(set.root, "ipfs://approved-set-demo")).wait();
  console.log(`2. ASP published approved-set root (proof of innocence available)`);

  // The relayer pays the supplier privately, gaslessly, with a real proof.
  const relayer = new Relayer(pool.connect(relayerOp) as any, {
    wasmPath, zkeyPath, poseidon, relayerAddress: relayerOp.address,
  });
  const fee = 3_000_000n;
  const note = wallet.unspent()[0].note;
  await client.pay(note, supplier.address, relayer, set, fee);
  const protocolFee = amount / 1000n;
  console.log(`3. relayer paid supplier ${usdcFmt(amount - fee - protocolFee)} privately (business paid no gas)`);
  console.log(`   supplier balance: ${usdcFmt(await usdc.balanceOf(supplier.address))}`);
  console.log(`   relayer fee: ${usdcFmt(fee)} · protocol fee -> buyback&burn: ${usdcFmt(protocolFee)}`);

  // The auditor recovers the amount from THIS payment's on-chain ciphertext.
  const events = (await pool.queryFilter(pool.filters.Deposit())) as any[];
  const ev = events.find((e) => BigInt(e.args.commitment) === commitment);
  if (!ev) throw new Error("deposit event not found");
  const recovered = client.audit(ev.args.encryptedNote);
  console.log(`4. auditor decrypted the shielded note with the view key: ${usdcFmt(recovered.value)}`);
  console.log(`\ndone — amount hidden from the public, provably clean, auditable on demand.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
