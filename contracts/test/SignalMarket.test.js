const { expect } = require("chai");
const { ethers } = require("hardhat");

const STAKE = 100n * 10n ** 6n;
const PUBKEY = "0x" + "11".repeat(32);
const BUYER_PUBKEY = "0x" + "22".repeat(32);
const SIGNAL_PRICE = 10_000n;     // 0.01 USDC

async function fixture() {
  const [owner, providerWallet, buyer, agent, attacker, treasury] = await ethers.getSigners();
  const MockUSDC = await ethers.getContractFactory("MockERC20");
  const usdc = await MockUSDC.deploy("USD Coin", "USDC", 6);

  for (const s of [providerWallet, buyer, agent, attacker]) {
    await usdc.mint(s.address, 100_000n * 10n ** 6n);
  }

  const Registry = await ethers.getContractFactory("ProviderRegistry");
  const registry = await Registry.deploy(await usdc.getAddress());
  await usdc.connect(providerWallet).approve(await registry.getAddress(), STAKE);
  await registry.connect(providerWallet).register("Alpha", "desc", 2, PUBKEY);

  const CR = await ethers.getContractFactory("CommitReveal");
  const cr = await CR.deploy();

  // Use MockVerifier in unit tests so we can exercise SignalMarket logic
  // (rate limits, root mismatches, pause) without generating real Groth16
  // proofs each time. The real `Groth16Verifier` from snarkjs is what gets
  // deployed by scripts/deploy.js and proven against in circuits/.
  const Verifier = await ethers.getContractFactory("MockVerifier");
  const verifier = await Verifier.deploy();

  const Market = await ethers.getContractFactory("SignalMarket");
  const market = await Market.deploy(
    await usdc.getAddress(),
    await registry.getAddress(),
    await cr.getAddress(),
    await verifier.getAddress()
  );

  return { owner, providerWallet, buyer, agent, attacker, treasury, usdc, registry, cr, verifier, market };
}

describe("SignalMarket — subscribe / float", function () {
  it("subscribes with valid bounds and pulls the float", async () => {
    const { buyer, agent, providerWallet, market, usdc } = await fixture();
    const float = 100n * 10n ** 6n;
    await usdc.connect(buyer).approve(await market.getAddress(), float);
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 500, 10000, 300, float)
    ).to.emit(market, "Subscribed");

    const sub = await market.getSubscription(providerWallet.address, buyer.address);
    expect(sub.active).to.equal(true);
    expect(sub.float).to.equal(float);
    expect(sub.agent).to.equal(agent.address);
  });

  it("rejects out-of-range bounds", async () => {
    const { buyer, agent, providerWallet, market } = await fixture();
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 6000, 10000, 300, 0)
    ).to.be.revertedWith("invalid maxPositionBps");
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 500, 5000, 300, 0)
    ).to.be.revertedWith("invalid maxLeverageBps");
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 500, 10000, 3000, 0)
    ).to.be.revertedWith("invalid dailyVarBps");
  });

  it("rejects zero agent and invalid pubkey", async () => {
    const { buyer, providerWallet, market } = await fixture();
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, ethers.ZeroAddress, BUYER_PUBKEY, 500, 10000, 300, 0)
    ).to.be.revertedWith("zero agent");
    await expect(
      market.connect(buyer).subscribe(providerWallet.address, buyer.address, "0x1234", 500, 10000, 300, 0)
    ).to.be.revertedWith("invalid pubkey");
  });

  it("unsubscribe returns remaining float and only remaining float", async () => {
    const { buyer, agent, providerWallet, market, usdc } = await fixture();
    const float = 50n * 10n ** 6n;
    await usdc.connect(buyer).approve(await market.getAddress(), float);
    await market.connect(buyer).subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 500, 10000, 300, float);
    const before = await usdc.balanceOf(buyer.address);
    await market.connect(buyer).unsubscribe(providerWallet.address);
    const after = await usdc.balanceOf(buyer.address);
    expect(after - before).to.equal(float);
  });
});

describe("SignalMarket — processSignalPayment", function () {
  async function setupSub() {
    const f = await fixture();
    const float = 100n * 10n ** 6n;
    await f.usdc.connect(f.buyer).approve(await f.market.getAddress(), float);
    await f.market
      .connect(f.buyer)
      .subscribe(f.providerWallet.address, f.agent.address, BUYER_PUBKEY, 500, 10000, 300, float);
    return f;
  }

  it("buyer can pay directly", async () => {
    const { buyer, providerWallet, market } = await setupSub();
    await expect(
      market.connect(buyer).processSignalPayment(providerWallet.address, buyer.address)
    ).to.emit(market, "SignalPaymentProcessed");
    const sub = await market.getSubscription(providerWallet.address, buyer.address);
    expect(sub.float).to.equal(100n * 10n ** 6n - SIGNAL_PRICE);
  });

  it("authorized agent can pay on behalf of buyer", async () => {
    const { agent, buyer, providerWallet, market } = await setupSub();
    await expect(
      market.connect(agent).processSignalPayment(providerWallet.address, buyer.address)
    ).to.emit(market, "SignalPaymentProcessed");
  });

  it("unauthorized address cannot pay", async () => {
    const { attacker, buyer, providerWallet, market } = await setupSub();
    await expect(
      market.connect(attacker).processSignalPayment(providerWallet.address, buyer.address)
    ).to.be.revertedWith("not authorized");
  });

  it("rejects when float is insufficient", async () => {
    const { buyer, providerWallet, market, agent, usdc } = await fixture();
    // Subscribe with tiny float that can't cover one signal.
    await usdc.connect(buyer).approve(await market.getAddress(), 1);
    await market
      .connect(buyer)
      .subscribe(providerWallet.address, agent.address, BUYER_PUBKEY, 500, 10000, 300, 1);
    await expect(
      market.connect(buyer).processSignalPayment(providerWallet.address, buyer.address)
    ).to.be.revertedWith("insufficient float");
  });

  it("splits payment into provider revenue and treasury", async () => {
    const { agent, buyer, providerWallet, market } = await setupSub();
    await market.connect(agent).processSignalPayment(providerWallet.address, buyer.address);
    const fee = (SIGNAL_PRICE * 300n) / 10000n;
    const providerAmt = SIGNAL_PRICE - fee;
    expect(await market.providerRevenue(providerWallet.address)).to.equal(providerAmt);
    expect(await market.treasuryBalance()).to.equal(fee);
  });

  it("withdrawFees only takes treasury, never buyer floats", async () => {
    const { agent, buyer, owner, providerWallet, market, usdc, treasury } = await setupSub();
    await market.connect(agent).processSignalPayment(providerWallet.address, buyer.address);
    const fee = (SIGNAL_PRICE * 300n) / 10000n;
    await market.connect(owner).withdrawFees(treasury.address);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    // Float remains intact.
    const sub = await market.getSubscription(providerWallet.address, buyer.address);
    expect(sub.float).to.equal(100n * 10n ** 6n - SIGNAL_PRICE);
  });

  it("claimRevenue pays the provider only their revenue", async () => {
    const { agent, buyer, providerWallet, market, usdc } = await setupSub();
    await market.connect(agent).processSignalPayment(providerWallet.address, buyer.address);
    const before = await usdc.balanceOf(providerWallet.address);
    await market.connect(providerWallet).claimRevenue();
    const after = await usdc.balanceOf(providerWallet.address);
    expect(after - before).to.equal(SIGNAL_PRICE - (SIGNAL_PRICE * 300n) / 10000n);
    expect(await market.providerRevenue(providerWallet.address)).to.equal(0);
  });

  it("pause stops payment", async () => {
    const { agent, buyer, owner, providerWallet, market } = await setupSub();
    await market.connect(owner).pause();
    await expect(
      market.connect(agent).processSignalPayment(providerWallet.address, buyer.address)
    ).to.be.reverted;
  });
});

describe("SignalMarket — submitStatsProof (stub verifier)", function () {
  it("rejects when commitment root mismatches", async () => {
    const { market, providerWallet, cr } = await fixture();
    const pA = [0n, 0n], pB = [[0n, 0n], [0n, 0n]], pC = [0n, 0n];
    const pubSignals = [6800n, 2340n, 100n, 1n]; // root = 1, doesn't match (cr is empty -> root = 0)
    await expect(
      market.connect(providerWallet).submitStatsProof(pA, pB, pC, pubSignals)
    ).to.be.revertedWith("commitment root mismatch");
  });

  it("rate-limits proof submissions", async () => {
    const { market, providerWallet, cr } = await fixture();
    const pA = [0n, 0n], pB = [[0n, 0n], [0n, 0n]], pC = [0n, 0n];
    const root = await cr.getCommitmentRoot(providerWallet.address); // 0
    const pub = [6800n, 2340n, 100n, BigInt(root)];
    await market.connect(providerWallet).submitStatsProof(pA, pB, pC, pub);
    await expect(
      market.connect(providerWallet).submitStatsProof(pA, pB, pC, pub)
    ).to.be.revertedWith("too soon");
  });

  it("rejects invalid winRate", async () => {
    const { market, providerWallet, cr } = await fixture();
    const pA = [0n, 0n], pB = [[0n, 0n], [0n, 0n]], pC = [0n, 0n];
    const root = await cr.getCommitmentRoot(providerWallet.address);
    const pub = [10_001n, 0n, 100n, BigInt(root)];
    await expect(
      market.connect(providerWallet).submitStatsProof(pA, pB, pC, pub)
    ).to.be.revertedWith("invalid winRate");
  });
});
