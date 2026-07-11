import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore - circomlibjs ships no types
import { poseidonContract } from "circomlibjs";

// End-to-end test with a REAL Groth16 proof verified on-chain. Runs only after
// `scripts/build-circuit.sh` + `scripts/gen-witness.mjs` have produced the
// verifier and calldata (both gitignored); otherwise it skips so the default
// suite stays green on a fresh clone.
const buildDir = path.join(__dirname, "..", "build");
const verifierSol = path.join(__dirname, "..", "contracts", "verifiers", "Verifier.sol");
const calldataPath = path.join(buildDir, "calldata.json");
const casePath = path.join(buildDir, "case.json");
const ARTIFACTS_READY =
  fs.existsSync(verifierSol) && fs.existsSync(calldataPath) && fs.existsSync(casePath);

const LEVELS = 20;

describe("VeilPool withdraw with a real Groth16 proof", function () {
  before(function () {
    if (!ARTIFACTS_READY) {
      this.skip(); // build the circuit first: `bash scripts/build-circuit.sh && node scripts/gen-witness.mjs`
    }
  });

  it("verifies a real proof on-chain and settles the withdrawal", async () => {
    const [deployer, depositor, feeCollector, aspOperator] = await ethers.getSigners();

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
      10, // 0.10% protocol fee
      feeCollector.address,
      deployer.address
    );

    const kase = JSON.parse(fs.readFileSync(casePath, "utf8"));
    const [a, b, c, pub] = JSON.parse(fs.readFileSync(calldataPath, "utf8"));
    const value = BigInt(kase.value);
    const fee = BigInt(kase.fee);

    // Deposit the commitment the proof was generated against.
    await token.mint(depositor.address, value);
    await token.connect(depositor).approve(await pool.getAddress(), value);
    await pool.connect(depositor).deposit(BigInt(kase.commitment), value, "0x");

    // The pool's post-deposit root must match the proof's public root signal.
    expect(await pool.getLastRoot()).to.equal(BigInt(pub[0]));

    // Publish the association-set root the proof used.
    await asp.connect(aspOperator).publishRoot(BigInt(pub[1]), "ipfs://approved-set");

    const protocolFee = (value * 10n) / 10_000n;
    const recipientAmount = value - fee - protocolFee;

    await expect(pool.withdraw(a, b, c, pub))
      .to.emit(pool, "Withdrawal")
      .withArgs(BigInt(pub[2]), kase.recipient, kase.relayer, recipientAmount, fee, protocolFee);

    expect(await token.balanceOf(kase.recipient)).to.equal(recipientAmount);
    expect(await token.balanceOf(kase.relayer)).to.equal(fee);
    expect(await token.balanceOf(feeCollector.address)).to.equal(protocolFee);

    // Replaying the same nullifier must now fail.
    await expect(pool.withdraw(a, b, c, pub)).to.be.revertedWithCustomError(
      pool,
      "NullifierUsed"
    );
  });

  it("rejects a proof whose public signals were tampered", async () => {
    const [deployer, depositor, feeCollector, aspOperator] = await ethers.getSigners();
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
      10,
      feeCollector.address,
      deployer.address
    );

    const kase = JSON.parse(fs.readFileSync(casePath, "utf8"));
    const [a, b, c, pub] = JSON.parse(fs.readFileSync(calldataPath, "utf8"));
    const value = BigInt(kase.value);

    await token.mint(depositor.address, value);
    await token.connect(depositor).approve(await pool.getAddress(), value);
    await pool.connect(depositor).deposit(BigInt(kase.commitment), value, "0x");
    await asp.connect(aspOperator).publishRoot(BigInt(pub[1]), "ipfs://approved-set");

    // Tamper the nullifierHash public signal: proof no longer satisfies the verifier.
    const tampered = [...pub];
    tampered[2] = (BigInt(pub[2]) + 1n).toString();
    await expect(pool.withdraw(a, b, c, tampered)).to.be.revertedWithCustomError(
      pool,
      "InvalidProof"
    );
  });
});
