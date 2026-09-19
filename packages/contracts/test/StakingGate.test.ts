import { expect } from "chai";
import { ethers } from "hardhat";
// @ts-ignore - circomlibjs ships no types
import { buildPoseidon, poseidonContract } from "circomlibjs";

const E = (n: string) => ethers.parseEther(n);

// A fee-earning relayer must be an active, staked (slashable) operator once the
// pool's staking gate is set. Uses the MockVerifier so it runs without the circuit.
describe("VeilPool staking gate", () => {
  const LEVELS = 20;

  it("blocks an unstaked relayer and allows a staked one", async () => {
    const [deployer, alice, recipient, relayer, feeCollector, treasury] = await ethers.getSigners();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const h2 = (a: bigint, b: bigint): bigint => F.toObject(poseidon([a, b]));

    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(deployer.address);
    const pool = await (await ethers.getContractFactory("VeilPool")).deploy(
      LEVELS, await hasher.getAddress(), await verifier.getAddress(), await asp.getAddress(),
      await usdc.getAddress(), 10, feeCollector.address, deployer.address
    );

    // Staking gate.
    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(deployer.address);
    const staking = await (await ethers.getContractFactory("VeilStaking")).deploy(
      await veil.getAddress(), deployer.address, treasury.address, 1000, E("1000")
    );
    await pool.setStakingGate(await staking.getAddress());

    // Alice deposits.
    const value = 1_000_000_000n;
    const nullifier = BigInt("0x" + "11".repeat(31));
    const secret = BigInt("0x" + "22".repeat(31));
    const commitment = h2(value, h2(nullifier, secret));
    const nullifierHash = h2(nullifier, nullifier);
    await usdc.mint(alice.address, value);
    await usdc.connect(alice).approve(await pool.getAddress(), value);
    await pool.connect(alice).deposit(commitment, value, "0x");
    const root = await pool.getLastRoot();
    await asp.publishRoot(commitment, "ipfs://set");

    const z2: [bigint, bigint] = [0n, 0n];
    const z4: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
    const signals = (fee: bigint) => [
      root, commitment, nullifierHash,
      BigInt(recipient.address), BigInt(relayer.address), fee, value,
    ];

    // Relayer is NOT staked -> a fee-earning withdrawal reverts.
    await expect(pool.withdraw(z2, z4, z2, signals(2_000_000n))).to.be.revertedWithCustomError(
      pool, "RelayerNotStaked"
    );

    // Stake the relayer past the minimum -> now active.
    await veil.transfer(relayer.address, E("2000"));
    await veil.connect(relayer).approve(await staking.getAddress(), E("2000"));
    await staking.connect(relayer).stake(1 /* Relayer */, E("2000"));
    expect(await staking.isActive(relayer.address)).to.equal(true);

    await pool.withdraw(z2, z4, z2, signals(2_000_000n));
    expect(await usdc.balanceOf(relayer.address)).to.equal(2_000_000n);
  });

  it("zero-fee (self) withdrawals are never gated", async () => {
    const [deployer, alice, recipient, , feeCollector, treasury] = await ethers.getSigners();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const h2 = (a: bigint, b: bigint): bigint => F.toObject(poseidon([a, b]));
    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(deployer.address);
    const pool = await (await ethers.getContractFactory("VeilPool")).deploy(
      LEVELS, await hasher.getAddress(), await verifier.getAddress(), await asp.getAddress(),
      await usdc.getAddress(), 10, feeCollector.address, deployer.address
    );
    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(deployer.address);
    const staking = await (await ethers.getContractFactory("VeilStaking")).deploy(
      await veil.getAddress(), deployer.address, treasury.address, 1000, E("1000")
    );
    await pool.setStakingGate(await staking.getAddress());

    const value = 1_000_000_000n;
    const nullifier = BigInt("0x" + "33".repeat(31));
    const secret = BigInt("0x" + "44".repeat(31));
    const commitment = h2(value, h2(nullifier, secret));
    const nullifierHash = h2(nullifier, nullifier);
    await usdc.mint(alice.address, value);
    await usdc.connect(alice).approve(await pool.getAddress(), value);
    await pool.connect(alice).deposit(commitment, value, "0x");
    const root = await pool.getLastRoot();
    await asp.publishRoot(commitment, "ipfs://set");

    const z2: [bigint, bigint] = [0n, 0n];
    const z4: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
    // fee = 0, relayer = 0 -> no gating, succeeds.
    await pool.withdraw(z2, z4, z2, [
      root, commitment, nullifierHash, BigInt(recipient.address), 0n, 0n, value,
    ]);
    const protocolFee = value / 1000n;
    expect(await usdc.balanceOf(recipient.address)).to.equal(value - protocolFee);
  });
});
