import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore - circomlibjs ships no types
import { poseidonContract } from "circomlibjs";
import { buildVeilPoseidon, AssociationSet, DEFAULT_LEVELS } from "../../sdk/dist/index.js";
import { Relayer } from "../../services/dist/index.js";
import { PaymentsClient, VeilWallet } from "../../app/dist/index.js";

// Drives the business-facing product API (shield -> pay -> audit) end-to-end with
// a real proof. Skips unless the circuit + service + app builds are present.
const cRoot = path.join(__dirname, "..");
const wasmPath = path.join(cRoot, "build", "withdraw_js", "withdraw.wasm");
const zkeyPath = path.join(cRoot, "build", "withdraw_final.zkey");
const READY =
  fs.existsSync(wasmPath) &&
  fs.existsSync(zkeyPath) &&
  fs.existsSync(path.join(cRoot, "contracts", "verifiers", "Verifier.sol")) &&
  fs.existsSync(path.join(cRoot, "..", "app", "dist", "index.js"));

const LEVELS = 20;

describe("VEIL payments app (product API)", function () {
  before(function () {
    if (!READY) this.skip();
  });

  it("shield -> pay (gasless, real proof) -> audit", async () => {
    const [deployer, business, supplier, relayerOp, feeCollector, aspOperator] =
      await ethers.getSigners();
    const poseidon = await buildVeilPoseidon();

    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(aspOperator.address);
    const pool = await (await ethers.getContractFactory("VeilPool")).deploy(
      LEVELS, await hasher.getAddress(), await verifier.getAddress(), await asp.getAddress(),
      await usdc.getAddress(), 10, feeCollector.address, deployer.address
    );

    // The business's wallet + client (business is the on-chain signer for deposits).
    const wallet = new VeilWallet();
    const poolAsBusiness = pool.connect(business) as any;
    const usdcAsBusiness = usdc.connect(business) as any;
    const client = new PaymentsClient(poolAsBusiness, usdcAsBusiness, poseidon, wallet);

    // --- shield 1,000 USDC ---
    const amount = 1_000_000_000n;
    await usdc.mint(business.address, amount);
    const { note, commitment } = await client.shield(amount);
    expect(client.balance()).to.equal(amount);
    expect(await pool.commitments(commitment)).to.equal(true);

    // --- ASP publishes an approved set that includes the business's deposit ---
    const set = new AssociationSet(poseidon, DEFAULT_LEVELS, [commitment]);
    await asp.connect(aspOperator).publishRoot(set.root, "ipfs://approved");

    // --- pay the supplier privately via the relayer (business pays no gas) ---
    const relayer = new Relayer(pool.connect(relayerOp) as any, {
      wasmPath, zkeyPath, poseidon, relayerAddress: relayerOp.address,
    });
    const fee = 4_000_000n;
    await client.pay(note, supplier.address, relayer, set, fee);

    const protocolFee = amount / 1000n;
    expect(await usdc.balanceOf(supplier.address)).to.equal(amount - fee - protocolFee);
    expect(client.balance()).to.equal(0n); // note now spent

    // --- audit: recover the amount from the on-chain ciphertext with the view key ---
    const ev = (await pool.queryFilter(pool.filters.Deposit()))[0] as any;
    const recovered = client.audit(ev.args.encryptedNote);
    expect(recovered.value).to.equal(amount);
  });

  it("wallet serialization round-trips", async () => {
    const w = new VeilWallet();
    w.add({ value: 5n, nullifier: 7n, secret: 9n }, 123n);
    w.markSpent(123n);
    const restored = VeilWallet.fromJSON(w.toJSON());
    expect(restored.notes[0].note.value).to.equal(5n);
    expect(restored.notes[0].spent).to.equal(true);
    expect(Buffer.from(restored.viewKey.publicKey)).to.deep.equal(Buffer.from(w.viewKey.publicKey));
  });
});
