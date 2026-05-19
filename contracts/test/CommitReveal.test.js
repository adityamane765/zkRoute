const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CommitReveal", function () {
  let cr, alice, bob;

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();
    const CR = await ethers.getContractFactory("CommitReveal");
    cr = await CR.deploy();
  });

  function makeCommit({ signalId, direction, asset, salt }) {
    const assetId = ethers.keccak256(ethers.toUtf8Bytes(asset));
    const hash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint8", "bytes32", "bytes32"],
      [signalId, direction, assetId, salt]
    );
    return { signalId, direction, assetId, salt, hash };
  }

  it("rejects empty signalId / hash", async () => {
    const zero = "0x" + "00".repeat(32);
    const some = "0x" + "11".repeat(32);
    await expect(cr.commit(zero, some)).to.be.revertedWith("empty signalId");
    await expect(cr.commit(some, zero)).to.be.revertedWith("empty hash");
  });

  it("commits, then reveals successfully", async () => {
    const c = makeCommit({ signalId: "0x" + "aa".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await expect(cr.commit(c.signalId, c.hash)).to.emit(cr, "SignalCommitted");
    await ethers.provider.send("evm_mine", []);
    await expect(cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true))
      .to.emit(cr, "SignalRevealed").withArgs(alice.address, c.signalId, true);
    const stored = await cr.getCommitment(alice.address, c.signalId);
    expect(stored.revealed).to.equal(true);
    expect(stored.outcome).to.equal(true);
  });

  it("increments revealedCount on reveal", async () => {
    const c = makeCommit({ signalId: "0x" + "aa".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    expect(await cr.revealedCount(alice.address)).to.equal(0);
    await ethers.provider.send("evm_mine", []);
    await cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true);
    expect(await cr.revealedCount(alice.address)).to.equal(1);
  });

  it("rejects double commit and double reveal", async () => {
    const c = makeCommit({ signalId: "0x" + "ab".repeat(32), direction: 0, asset: "BTC", salt: "0x" + "cd".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    await expect(cr.commit(c.signalId, c.hash)).to.be.revertedWith("already committed");
    await ethers.provider.send("evm_mine", []);
    await cr.reveal(c.signalId, c.direction, c.assetId, c.salt, false);
    await expect(cr.reveal(c.signalId, c.direction, c.assetId, c.salt, false)).to.be.revertedWith("already revealed");
  });

  it("rejects mismatched preimage", async () => {
    const c = makeCommit({ signalId: "0x" + "ac".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    await ethers.provider.send("evm_mine", []);
    await expect(cr.reveal(c.signalId, 0, c.assetId, c.salt, true)).to.be.revertedWith("hash mismatch");
  });

  it("rejects reveal past the max window", async () => {
    const c = makeCommit({ signalId: "0x" + "ad".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "ee".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    await ethers.provider.send("hardhat_mine", ["0x" + (50_001).toString(16)]);
    await expect(cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true)).to.be.revertedWith("reveal window expired");
  });

  it("verifySignalBatch returns true for revealed signals", async () => {
    const c = makeCommit({ signalId: "0x" + "aa".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    await ethers.provider.send("evm_mine", []);
    await cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true);
    expect(await cr.verifySignalBatch(alice.address, [c.signalId], [c.hash])).to.equal(true);
  });

  it("verifySignalBatch returns false for unrevealed signal", async () => {
    const c = makeCommit({ signalId: "0x" + "aa".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    // not yet revealed
    expect(await cr.verifySignalBatch(alice.address, [c.signalId], [c.hash])).to.equal(false);
  });

  it("verifySignalBatch returns false for wrong hash", async () => {
    const c = makeCommit({ signalId: "0x" + "aa".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "bb".repeat(32) });
    await cr.commit(c.signalId, c.hash);
    await ethers.provider.send("evm_mine", []);
    await cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true);
    expect(await cr.verifySignalBatch(alice.address, [c.signalId], ["0x" + "ff".repeat(32)])).to.equal(false);
  });

  it("verifySignalBatch returns false for unknown signalId", async () => {
    expect(await cr.verifySignalBatch(alice.address, ["0x" + "ff".repeat(32)], ["0x" + "00".repeat(32)])).to.equal(false);
  });
});
