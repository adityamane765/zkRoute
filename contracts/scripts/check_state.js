const { ethers } = require("hardhat");
async function main() {
  const cr = await ethers.getContractAt("CommitReveal", process.env.COMMIT_REVEAL_ADDRESS);
  const prov = "0xbb93f8e5A6e42378dcA33953Fa46419263Dc7cc6"; // our demo provider

  const total    = await cr.getSignalCount(prov);
  const revealed = await cr.revealedCount(prov);
  console.log(`provider          ${prov}`);
  console.log(`committed signals ${total}`);
  console.log(`revealed signals  ${revealed}`);

  const ids = await cr.getSignalHistory(prov);
  let revealedHashes = 0;
  const revealedList = [];
  for (let i = 0; i < ids.length; i++) {
    const c = await cr.getCommitment(prov, ids[i]);
    if (c.revealed) {
      revealedHashes++;
      revealedList.push({ signalId: ids[i], hash: c.hash, outcome: c.outcome, direction: c.direction });
    }
  }
  console.log(`revealed (loop)   ${revealedHashes}`);
  console.log("first 3 revealed signals:");
  revealedList.slice(0, 3).forEach(s => console.log(" ", s));

  // Persist for the prover to consume
  const fs = require("fs");
  fs.writeFileSync(
    "/tmp/revealed_signals.json",
    JSON.stringify(revealedList.map(r => ({
      signalId: r.signalId,
      hash:     r.hash,
      direction: Number(r.direction),
      outcome:  r.outcome ? 1 : 0,
    })), null, 2),
  );
  console.log(`\nwrote ${revealedList.length} revealed signals to /tmp/revealed_signals.json`);
}
main().catch(e => { console.error(e); process.exit(1); });
