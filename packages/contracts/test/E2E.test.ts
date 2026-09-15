import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore - circomlibjs ships no types
import { poseidonContract } from "circomlibjs";
import {
  buildVeilPoseidon,
  createNote,
  commitment as commitmentOf,
  encodeNote,
  encryptNote,
  generateViewKeyPair,
  type Note,
} from "../../sdk/dist/index.js";
import { AspService, Relayer } from "../../services/dist/index.js";

// Full-system test: deploy the pool + real verifier, a user deposits, the ASP
// screens deposits and publishes the approved-set root, and the relayer generates
// a real proof and submits the gasless withdrawal. Skips unless the circuit and
// service builds exist.
const cRoot = path.join(__dirname, "..");
const wasmPath = path.join(cRoot, "build", "withdraw_js", "withdraw.wasm");
const zkeyPath = path.join(cRoot, "build", "withdraw_final.zkey");
const verifierSol = path.join(cRoot, "contracts", "verifiers", "Verifier.sol");
const servicesDist = path.join(cRoot, "..", "services", "dist", "index.js");
const READY =
  fs.existsSync(wasmPath) &&
  fs.existsSync(zkeyPath) &&
  fs.existsSync(verifierSol) &&
  fs.existsSync(servicesDist);

const LEVELS = 20;

describe("VEIL end-to-end (relayer + ASP + real proof)", function () {
  before(function () {
    if (!READY) this.skip();
  });

  async function deployStack() {
    const [deployer, alice, blocked, recipient, relayerOp, feeCollector, aspOperator] =
      await ethers.getSigners();
    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const token = await (await ethers.getContractFactory("MockERC20")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(
      aspOperator.address
    );
    const pool = await (await ethers.getContractFactory("VeilPool")).deploy(
      LEVELS,
      await hasher.getAddress(),
      await verifier.getAddress(),
      await asp.getAddress(),
      await token.getAddress(),
      10, // 0.10%
      feeCollector.address,
      deployer.address
    );
    return { deployer, alice, blocked, recipient, relayerOp, feeCollector, aspOperator, token, asp, pool };
  }

  it("user deposits, ASP screens & publishes, relayer proves & settles gaslessly", async () => {
    const s = await deployStack();
    const poseidon = await buildVeilPoseidon();
    const poolAddr = await s.pool.getAddress();

    // --- Alice shields 1,000 USDC, note encrypted to an auditor view key ---
    const auditor = generateViewKeyPair();
    const value = 1_000_000_000n;
    const note: Note = createNote(value);
    const commitment = commitmentOf(poseidon, note);
    const encrypted = ethers.hexlify(encryptNote(auditor.publicKey, encodeNote(note)));

    await s.token.mint(s.alice.address, value);
    await s.token.connect(s.alice).approve(poolAddr, value);
    await s.pool.connect(s.alice).deposit(commitment, value, encrypted);

    // --- ASP screens deposits (blocked address excluded) and publishes the root ---
    const aspService = new AspService(poseidon, [s.blocked.address], LEVELS);
    const records = [
      { depositor: s.alice.address, commitment },
      { depositor: s.blocked.address, commitment: commitmentOf(poseidon, createNote(1n)) },
    ];
    expect(aspService.screen(records)).to.deep.equal([commitment]); // blocked one dropped
    const set = aspService.buildSet(records);
    await aspService.publish(s.asp.connect(s.aspOperator) as any, set, "ipfs://approved-set-1");
    expect(await s.asp.isKnownRoot(set.root)).to.equal(true);

    // --- Relayer proves + submits the gasless withdrawal for Alice ---
    const relayer = new Relayer(s.pool.connect(s.relayerOp) as any, {
      wasmPath,
      zkeyPath,
      poseidon,
      relayerAddress: s.relayerOp.address,
    });
    const relayerFee = 3_000_000n; // 3 USDC paid to the relayer
    await relayer.relayWithdraw(note, s.recipient.address, set, relayerFee);

    const protocolFee = (value * 10n) / 10_000n; // 1 USDC
    expect(await s.token.balanceOf(s.recipient.address)).to.equal(value - relayerFee - protocolFee);
    expect(await s.token.balanceOf(s.relayerOp.address)).to.equal(relayerFee);
    expect(await s.token.balanceOf(s.feeCollector.address)).to.equal(protocolFee);

    // Auditor can still recover the amount from the on-chain ciphertext.
    const ev = (await s.pool.queryFilter(s.pool.filters.Deposit()))[0] as any;
    const { decryptNote, decodeNote } = await import("../../sdk/dist/index.js");
    const recovered = decodeNote(decryptNote(auditor.secretKey, ethers.getBytes(ev.args.encryptedNote)));
    expect(recovered.value).to.equal(value);
  });

  it("relayer refuses a note that isn't in the approved set", async () => {
    const s = await deployStack();
    const poseidon = await buildVeilPoseidon();
    const poolAddr = await s.pool.getAddress();

    const value = 500_000_000n;
    const note = createNote(value);
    const commitment = commitmentOf(poseidon, note);
    await s.token.mint(s.alice.address, value);
    await s.token.connect(s.alice).approve(poolAddr, value);
    await s.pool.connect(s.alice).deposit(commitment, value, "0x");

    // ASP builds a set that does NOT include Alice's deposit (she was screened out).
    const aspService = new AspService(poseidon, [s.alice.address], LEVELS);
    const set = aspService.buildSet([{ depositor: s.alice.address, commitment }]);

    const relayer = new Relayer(s.pool.connect(s.relayerOp) as any, {
      wasmPath,
      zkeyPath,
      poseidon,
      relayerAddress: s.relayerOp.address,
    });
    await expect(relayer.relayWithdraw(note, s.recipient.address, set, 0n)).to.be.rejectedWith(
      /not in approved association set/
    );
  });
});
