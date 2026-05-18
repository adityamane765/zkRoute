const { expect } = require("chai");
const { ethers } = require("hardhat");

const STAKE = 100n * 10n ** 6n;
const PUBKEY = "0x" + "11".repeat(32);

describe("ProviderRegistry", function () {
  let usdc, registry, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockERC20");
    usdc = await MockUSDC.deploy("USD Coin", "USDC", 6);
    const Registry = await ethers.getContractFactory("ProviderRegistry");
    registry = await Registry.deploy(await usdc.getAddress());
    for (const s of [alice, bob]) {
      await usdc.mint(s.address, 10000n * 10n ** 6n);
      await usdc.connect(s).approve(await registry.getAddress(), 10000n * 10n ** 6n);
    }
  });

  it("rejects construction with zero usdc", async () => {
    const Registry = await ethers.getContractFactory("ProviderRegistry");
    await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWith("zero usdc");
  });

  it("registers a provider and pulls stake", async () => {
    const before = await usdc.balanceOf(alice.address);
    await expect(
      registry.connect(alice).register("Alice Alpha", "desc", 2, PUBKEY)
    ).to.emit(registry, "ProviderRegistered");
    const after = await usdc.balanceOf(alice.address);
    expect(before - after).to.equal(STAKE);
    const p = await registry.getProvider(alice.address);
    expect(p.active).to.equal(true);
    expect(p.slashed).to.equal(false);
    expect(p.name).to.equal("Alice Alpha");
  });

  it("rejects re-registration", async () => {
    await registry.connect(alice).register("a", "b", 0, PUBKEY);
    await expect(
      registry.connect(alice).register("a", "b", 0, PUBKEY)
    ).to.be.revertedWith("already registered");
  });

  it("validates pubkey length", async () => {
    await expect(
      registry.connect(alice).register("a", "b", 0, "0x1234")
    ).to.be.revertedWith("invalid pubkey length");
  });

  it("validates name bounds", async () => {
    await expect(
      registry.connect(alice).register("", "b", 0, PUBKEY)
    ).to.be.revertedWith("invalid name");
    const tooLong = "x".repeat(81);
    await expect(
      registry.connect(alice).register(tooLong, "b", 0, PUBKEY)
    ).to.be.revertedWith("invalid name");
  });

  it("returns the stake on deactivate", async () => {
    await registry.connect(alice).register("a", "b", 0, PUBKEY);
    const balBefore = await usdc.balanceOf(alice.address);
    await expect(registry.connect(alice).deactivate()).to.emit(registry, "ProviderDeactivated");
    const balAfter = await usdc.balanceOf(alice.address);
    expect(balAfter - balBefore).to.equal(STAKE);
    const p = await registry.getProvider(alice.address);
    expect(p.active).to.equal(false);
  });

  it("slashes only by owner; slashed stake stays in slashedBalance", async () => {
    await registry.connect(alice).register("a", "b", 0, PUBKEY);
    await expect(registry.connect(bob).slash(alice.address, "fraud")).to.be.reverted;
    await registry.connect(owner).slash(alice.address, "fraud");
    expect(await registry.slashedBalance()).to.equal(STAKE);

    // Alice cannot re-register after slash.
    await expect(
      registry.connect(alice).register("a", "b", 0, PUBKEY)
    ).to.be.revertedWith("address slashed");
  });

  it("owner can withdraw only the slashed balance, not active stakes", async () => {
    await registry.connect(alice).register("a", "b", 0, PUBKEY);   // 100 staked
    await registry.connect(bob).register("a", "b", 0, PUBKEY);     // 100 staked
    await registry.connect(owner).slash(alice.address, "fraud");   // 100 slashed
    const t = (await ethers.getSigners())[3];
    await registry.connect(owner).withdrawSlashedFunds(t.address);
    expect(await usdc.balanceOf(t.address)).to.equal(STAKE);
    // Bob can still deactivate and retrieve their stake.
    await registry.connect(bob).deactivate();
  });

  it("pauses register", async () => {
    await registry.connect(owner).pause();
    await expect(
      registry.connect(alice).register("a", "b", 0, PUBKEY)
    ).to.be.reverted;
    await registry.connect(owner).unpause();
    await registry.connect(alice).register("a", "b", 0, PUBKEY);
  });
});
