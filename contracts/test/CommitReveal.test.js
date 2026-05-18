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
    const c = makeCommit({
      signalId: "0x" + "aa".repeat(32),
      direction: 1,
      asset: "ETH",
      salt: "0x" + "bb".repeat(32),
    });
    await expect(cr.commit(c.signalId, c.hash)).to.emit(cr, "SignalCommitted");
    // mine a block to satisfy MIN_REVEAL_DELAY_BLOCKS
    await ethers.provider.send("evm_mine", []);
    await expect(cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true))
      .to.emit(cr, "SignalRevealed").withArgs(alice.address, c.signalId, true);

    const stored = await cr.getCommitment(alice.address, c.signalId);
    expect(stored.revealed).to.equal(true);
    expect(stored.outcome).to.equal(true);
  });

  it("rejects double commit and double reveal", async () => {
    const c = makeCommit({
      signalId: "0x" + "ab".repeat(32),
      direction: 0,
      asset: "BTC",
      salt: "0x" + "cd".repeat(32),
    });
    await cr.commit(c.signalId, c.hash);
    await expect(cr.commit(c.signalId, c.hash)).to.be.revertedWith("already committed");
    await ethers.provider.send("evm_mine", []);
    await cr.reveal(c.signalId, c.direction, c.assetId, c.salt, false);
    await expect(
      cr.reveal(c.signalId, c.direction, c.assetId, c.salt, false)
    ).to.be.revertedWith("already revealed");
  });

  it("rejects mismatched preimage", async () => {
    const c = makeCommit({
      signalId: "0x" + "ac".repeat(32),
      direction: 1,
      asset: "ETH",
      salt: "0x" + "bb".repeat(32),
    });
    await cr.commit(c.signalId, c.hash);
    await ethers.provider.send("evm_mine", []);
    // wrong direction
    await expect(
      cr.reveal(c.signalId, 0, c.assetId, c.salt, true)
    ).to.be.revertedWith("hash mismatch");
  });

  it("getCommitmentRoot is stable to insertion order per provider", async () => {
    const c1 = makeCommit({ signalId: "0x" + "01".repeat(32), direction: 1, asset: "ETH", salt: "0x" + "0a".repeat(32) });
    const c2 = makeCommit({ signalId: "0x" + "02".repeat(32), direction: 0, asset: "BTC", salt: "0x" + "0b".repeat(32) });
    await cr.commit(c1.signalId, c1.hash);
    await cr.commit(c2.signalId, c2.hash);
    const aliceRoot = await cr.getCommitmentRoot(alice.address);
    expect(aliceRoot).to.not.equal("0x" + "00".repeat(32));

    // Bob has nothing committed.
    expect(await cr.getCommitmentRoot(bob.address)).to.equal("0x" + "00".repeat(32));
  });

  it("rejects reveal past the max window", async () => {
    const c = makeCommit({
      signalId: "0x" + "ad".repeat(32),
      direction: 1,
      asset: "ETH",
      salt: "0x" + "ee".repeat(32),
    });
    await cr.commit(c.signalId, c.hash);
    // Hardhat lets us jump 50_000+ blocks via evm_mine with hex count.
    const advance = 50_001;
    await ethers.provider.send("hardhat_mine", ["0x" + advance.toString(16)]);
    await expect(
      cr.reveal(c.signalId, c.direction, c.assetId, c.salt, true)
    ).to.be.revertedWith("reveal window expired");
  });
});
