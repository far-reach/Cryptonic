import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
// @ts-ignore - circomlibjs ships no types
import { buildPoseidon, poseidonContract } from "circomlibjs";

// Cross-chain shielded payment (ERC-7683 style). Both settlers run on one hardhat
// chain here, sharing a settlement oracle — in production they sit on separate
// chains joined by a bridge/messaging attestation.
describe("VEIL cross-chain shielded payment", () => {
  const LEVELS = 20;

  async function deploy() {
    const [deployer, alice, solver, aspOperator, feeCollector] = await ethers.getSigners();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const h2 = (a: bigint, b: bigint): bigint => F.toObject(poseidon([a, b]));

    // Destination VeilPool (where the recipient gets shielded funds).
    const abi = poseidonContract.generateABI(2);
    const bytecode = poseidonContract.createCode(2);
    const hasher = await new ethers.ContractFactory(abi, bytecode, deployer).deploy();
    await hasher.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy();
    const asp = await (await ethers.getContractFactory("AssociationSetRegistry")).deploy(aspOperator.address);
    const destPool = await (await ethers.getContractFactory("VeilPool")).deploy(
      LEVELS, await hasher.getAddress(), await verifier.getAddress(), await asp.getAddress(),
      await usdc.getAddress(), 10, feeCollector.address, deployer.address
    );

    const oracle = await (await ethers.getContractFactory("MockSettlementOracle")).deploy();
    const origin = await (await ethers.getContractFactory("OriginSettler")).deploy(
      await usdc.getAddress(), await oracle.getAddress()
    );
    const dest = await (await ethers.getContractFactory("DestinationSettler")).deploy(
      await oracle.getAddress()
    );

    return { deployer, alice, solver, feeCollector, poseidon, h2, usdc, destPool, oracle, origin, dest };
  }

  function makeOrder(fields: Partial<any>, sender: string, destPool: string, commitment: bigint) {
    return {
      sender,
      originChainId: 1n,
      destChainId: 10n,
      destPool,
      recipientCommitment: commitment,
      amount: 500_000_000n, // 500 USDC
      solverFee: 5_000_000n, // 5 USDC
      fillDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: 1n,
      ...fields,
    };
  }

  it("open → fill (shields for recipient) → claim pays the solver", async () => {
    const s = await deploy();
    const total = 505_000_000n; // amount + solverFee

    // Bob's shielded note/commitment on the destination.
    const bobNote = { value: 500_000_000n, nullifier: 7n, secret: 9n };
    const commitment = s.h2(bobNote.value, s.h2(bobNote.nullifier, bobNote.secret));
    const order = makeOrder({}, s.alice.address, await s.destPool.getAddress(), commitment);

    // 1. Alice opens the order, escrowing amount+fee (would be funded by a Pool A withdrawal).
    await s.usdc.mint(s.alice.address, total);
    await s.usdc.connect(s.alice).approve(await s.origin.getAddress(), total);
    const orderId = await s.origin.connect(s.alice).open.staticCall(order);
    await expect(s.origin.connect(s.alice).open(order)).to.emit(s.origin, "Open");
    expect(await s.usdc.balanceOf(await s.origin.getAddress())).to.equal(total);

    // 2. Solver fills on the destination: shields 500 USDC for Bob in destPool.
    await s.usdc.mint(s.solver.address, order.amount);
    await s.usdc.connect(s.solver).approve(await s.dest.getAddress(), order.amount);
    await expect(s.dest.connect(s.solver).fill(order, await s.usdc.getAddress(), "0xbeef"))
      .to.emit(s.dest, "Filled");
    expect(await s.destPool.commitments(commitment)).to.equal(true);
    expect(await s.usdc.balanceOf(await s.destPool.getAddress())).to.equal(order.amount);
    expect(await s.oracle.isFilled(orderId)).to.equal(true);

    // 3. Solver claims the escrow on origin: gets amount + fee back (net profit = fee).
    const before = await s.usdc.balanceOf(s.solver.address);
    await expect(s.origin.connect(s.solver).claim(order)).to.emit(s.origin, "Claimed");
    expect(await s.usdc.balanceOf(s.solver.address)).to.equal(before + total);
    expect(await s.usdc.balanceOf(await s.origin.getAddress())).to.equal(0);
  });

  it("double-fill and double-claim are rejected", async () => {
    const s = await deploy();
    const commitment = s.h2(1n, 2n);
    const order = makeOrder({ nonce: 2n }, s.alice.address, await s.destPool.getAddress(), commitment);
    const total = order.amount + order.solverFee;

    await s.usdc.mint(s.alice.address, total);
    await s.usdc.connect(s.alice).approve(await s.origin.getAddress(), total);
    await s.origin.connect(s.alice).open(order);

    await s.usdc.mint(s.solver.address, order.amount * 2n);
    await s.usdc.connect(s.solver).approve(await s.dest.getAddress(), order.amount * 2n);
    await s.dest.connect(s.solver).fill(order, await s.usdc.getAddress(), "0x");
    await expect(s.dest.connect(s.solver).fill(order, await s.usdc.getAddress(), "0x"))
      .to.be.revertedWithCustomError(s.dest, "AlreadyFilled");

    await s.origin.connect(s.solver).claim(order);
    await expect(s.origin.connect(s.solver).claim(order)).to.be.revertedWithCustomError(
      s.origin, "NotOpen"
    );
  });

  it("opener can refund after the deadline if unfilled", async () => {
    const s = await deploy();
    const commitment = s.h2(3n, 4n);
    const deadline = BigInt((await time.latest()) + 100);
    const order = makeOrder(
      { nonce: 3n, fillDeadline: deadline },
      s.alice.address,
      await s.destPool.getAddress(),
      commitment
    );
    const total = order.amount + order.solverFee;

    await s.usdc.mint(s.alice.address, total);
    await s.usdc.connect(s.alice).approve(await s.origin.getAddress(), total);
    await s.origin.connect(s.alice).open(order);

    await expect(s.origin.connect(s.alice).refund(order)).to.be.revertedWithCustomError(
      s.origin, "NotExpired"
    );
    await time.increaseTo(deadline + 1n);
    const before = await s.usdc.balanceOf(s.alice.address);
    await s.origin.connect(s.alice).refund(order);
    expect(await s.usdc.balanceOf(s.alice.address)).to.equal(before + total);
  });
});
