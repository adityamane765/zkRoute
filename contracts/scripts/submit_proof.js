/**
 * Submit the Groth16 proof from /tmp/proof.json to the live SignalMarket.
 * Called by the PROVIDER (whose signals are in CommitReveal).
 *
 *   PROVIDER_AGENT_PRIVATE_KEY=... \
 *     npx hardhat run scripts/submit_proof.js --network arc
 */
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const wallet = new ethers.Wallet(process.env.PROVIDER_AGENT_PRIVATE_KEY, ethers.provider);
  const sm = (await ethers.getContractAt("SignalMarket", process.env.SIGNAL_MARKET_ADDRESS)).connect(wallet);
  const cr = await ethers.getContractAt("CommitReveal", process.env.COMMIT_REVEAL_ADDRESS);

  // Sanity: confirm provider has 100 revealed signals
  const revealed = await cr.revealedCount(wallet.address);
  console.log(`provider:           ${wallet.address}`);
  console.log(`revealedCount:      ${revealed}`);

  // Load proof
  const proof = JSON.parse(fs.readFileSync("/tmp/proof.json"));
  // snarkjs calldata format: `["pA"], [["pB"]], ["pC"], ["pubSignals"]`
  // Wrap in brackets to JSON-parse into a 4-tuple.
  const [pA, pB, pC, pubSignals] = JSON.parse("[" + proof.calldata + "]");

  console.log(`\npublic stats from proof:`);
  console.log(`  winRateBps:     ${pubSignals[0]}`);
  console.log(`  totalReturnBps: ${pubSignals[1]}`);
  console.log(`  totalSignals:   ${pubSignals[2]}`);
  console.log(`  commitmentRoot: ${pubSignals[3].slice(0, 12)}…`);
  console.log(`  signalIds:      ${proof.signalIds.length}`);
  console.log(`  hashes:         ${proof.hashes.length}`);

  // Sanity: call locally first via staticCall would be useful but submitStatsProof is non-view.
  // Estimate gas — if it would revert, we'll see why.
  console.log(`\n→ estimating gas…`);
  try {
    const gas = await sm.submitStatsProof.estimateGas(pA, pB, pC, pubSignals, proof.signalIds, proof.hashes);
    console.log(`  estimate: ${gas}`);
  } catch (e) {
    console.error(`  ✗ revert during estimate: ${e.shortMessage || e.message}`);
    process.exit(1);
  }

  console.log(`\n→ submitting submitStatsProof…`);
  const tx = await sm.submitStatsProof(pA, pB, pC, pubSignals, proof.signalIds, proof.hashes);
  console.log(`  tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ mined in block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);

  // Confirm provider stats updated
  const stats = await sm.providerStats(wallet.address);
  console.log(`\non-chain providerStats:`);
  console.log(`  winRateBps:     ${stats.winRateBps}`);
  console.log(`  totalReturnBps: ${stats.totalReturnBps}`);
  console.log(`  totalSignals:   ${stats.totalSignals}`);
  console.log(`  lastProofBlock: ${stats.lastProofBlock}`);
}

main().catch(e => { console.error(e); process.exit(1); });
