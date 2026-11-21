import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
// @ts-ignore - circomlibjs ships no types
import { buildPoseidon, poseidonContract } from "circomlibjs";

const E = (n: string) => ethers.parseEther(n);
const RATE_NUM = 2_000_000_000_000n; // 1 USDC (1e6) -> 2 VEIL (2e18): 1e6 * 2e12 = 2e18
const RATE_DEN = 1n;

describe("VeilToken", () => {
  it("mints a fixed 1B supply to the distribution address and can be burned", async () => {
    const [dist] = await ethers.getSigners();
    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(dist.address);
    const MAX = await veil.MAX_SUPPLY();
    expect(await veil.totalSupply()).to.equal(MAX);
    expect(await veil.balanceOf(dist.address)).to.equal(MAX);

    await veil.burn(E("1000"));
    expect(await veil.totalSupply()).to.equal(MAX - E("1000"));
  });
});

describe("BuybackBurner", () => {
  async function deploy() {
    const [gov, treasury, other] = await ethers.getSigners();
    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(gov.address);
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const router = await (await ethers.getContractFactory("MockSwapRouter")).deploy(RATE_NUM, RATE_DEN);
    // Fund the router with VEIL liquidity.
    await veil.transfer(await router.getAddress(), E("1000000"));

    const burner = await (await ethers.getContractFactory("BuybackBurner")).deploy(
      await usdc.getAddress(),
      await veil.getAddress(),
      await router.getAddress(),
      treasury.address,
      5000, // 50% burn / 50% treasury
      gov.address
    );
    return { gov, treasury, other, veil, usdc, router, burner };
  }

  it("swaps accumulated fees to VEIL, burns half, sends half to treasury", async () => {
    const { treasury, veil, usdc, burner } = await deploy();
    const supplyBefore = await veil.totalSupply();

    // 100 USDC of protocol fees land in the burner.
    await usdc.mint(await burner.getAddress(), 100_000_000n);

    // 100 USDC -> 200 VEIL; burn 100, treasury 100.
    await expect(burner.execute(0)).to.emit(burner, "Executed").withArgs(
      100_000_000n,
      E("200"),
      E("100"),
      E("100")
    );

    expect(await veil.totalSupply()).to.equal(supplyBefore - E("100"));
    expect(await veil.balanceOf(treasury.address)).to.equal(E("100"));
    expect(await usdc.balanceOf(await burner.getAddress())).to.equal(0);
    expect(await burner.totalBurned()).to.equal(E("100"));
  });

  it("reverts on empty balance and on slippage", async () => {
    const { usdc, burner } = await deploy();
    await expect(burner.execute(0)).to.be.revertedWithCustomError(burner, "NothingToBuy");
    await usdc.mint(await burner.getAddress(), 100_000_000n);
    await expect(burner.execute(E("1000"))).to.be.reverted; // minVeilOut too high
  });

  it("only governance can change params", async () => {
    const { burner, router, treasury, other } = await deploy();
    await expect(
      burner.connect(other).setParams(await router.getAddress(), treasury.address, 3000)
    ).to.be.revertedWithCustomError(burner, "NotGovernance");
  });
});

describe("BuybackBurner fed by a real pool withdrawal", () => {
  it("routes a pool protocol fee into buyback-and-burn", async () => {
    const [deployer, alice, recipient, relayer, treasury] = await ethers.getSigners();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const h2 = (a: bigint, b: bigint): bigint => F.toObject(poseidon([a, b]));

    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();

    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(deployer.address);
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const router = await (await ethers.getContractFactory("MockSwapRouter")).deploy(RATE_NUM, RATE_DEN);
    await veil.transfer(await router.getAddress(), E("1000000"));
    const burner = await (await ethers.getContractFactory("BuybackBurner")).deploy(
      await usdc.getAddress(), await veil.getAddress(), await router.getAddress(),
      treasury.address, 5000, deployer.address
    );
    const verifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(deployer.address);
    const pool = await (await ethers.getContractFactory("VeilPool")).deploy(
      20, await hasher.getAddress(), await verifier.getAddress(), await asp.getAddress(),
      await usdc.getAddress(), 10 /* 0.10% */, await burner.getAddress(), deployer.address
    );

    // Alice deposits, then a (mock-proof) withdrawal routes the protocol fee to the burner.
    const value = 1_000_000_000n; // 1,000 USDC
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
    await pool.withdraw(z2, z4, z2, [
      root, commitment, nullifierHash,
      BigInt(recipient.address), BigInt(relayer.address), 0n, value,
    ]);

    const protocolFee = value / 1000n; // 0.10% = 1 USDC
    expect(await usdc.balanceOf(await burner.getAddress())).to.equal(protocolFee);

    const supplyBefore = await veil.totalSupply();
    await burner.execute(0); // 1 USDC -> 2 VEIL; burn 1 VEIL
    expect(await veil.totalSupply()).to.equal(supplyBefore - E("1"));
  });
});

describe("VeilStaking", () => {
  const COOLDOWN = 1000;
  async function deploy() {
    const [gov, treasury, operator, other] = await ethers.getSigners();
    const veil = await (await ethers.getContractFactory("VeilToken")).deploy(gov.address);
    const staking = await (await ethers.getContractFactory("VeilStaking")).deploy(
      await veil.getAddress(), gov.address, treasury.address, COOLDOWN, E("1000")
    );
    await veil.transfer(operator.address, E("5000"));
    await veil.connect(operator).approve(await staking.getAddress(), ethers.MaxUint256);
    return { gov, treasury, operator, other, veil, staking };
  }

  it("stakes, enforces min-stake activity, and the kind is fixed on first stake", async () => {
    const { operator, staking } = await deploy();
    await staking.connect(operator).stake(1 /* Relayer */, E("2000"));
    expect(await staking.isActive(operator.address)).to.equal(true);
    const op = await staking.operators(operator.address);
    expect(op.kind).to.equal(1);
    expect(op.staked).to.equal(E("2000"));
    // Same operator cannot switch role.
    await expect(staking.connect(operator).stake(2 /* Prover */, E("1"))).to.be.revertedWithCustomError(
      staking, "BadKind"
    );
  });

  it("unstake respects the cooldown", async () => {
    const { operator, staking, veil } = await deploy();
    await staking.connect(operator).stake(1, E("2000"));
    await staking.connect(operator).requestUnstake(E("500"));
    await expect(staking.connect(operator).withdraw()).to.be.revertedWithCustomError(
      staking, "StillLocked"
    );
    await time.increase(COOLDOWN + 1);
    const before = await veil.balanceOf(operator.address);
    await staking.connect(operator).withdraw();
    expect(await veil.balanceOf(operator.address)).to.equal(before + E("500"));
  });

  it("governance can slash active stake to the beneficiary", async () => {
    const { gov, treasury, operator, other, staking, veil } = await deploy();
    await staking.connect(operator).stake(1, E("2000"));

    await expect(staking.connect(other).slash(operator.address, E("300"))).to.be.revertedWithCustomError(
      staking, "NotGovernance"
    );

    await staking.connect(gov).slash(operator.address, E("300"));
    const op = await staking.operators(operator.address);
    expect(op.staked).to.equal(E("1700"));
    expect(await veil.balanceOf(treasury.address)).to.equal(E("300"));
  });
});
