/**
 * Deploy the freshly generated Groth16Verifier (from `circuits/npm run setup`)
 * and swap it into SignalMarket via setVerifier(addr).
 *
 *   ARC_PRIVATE_KEY=...  npx hardhat run scripts/deploy_verifier.js --network arc
 */
const { ethers } = require("hardhat");

async function main() {
  const signalMarketAddr = process.env.SIGNAL_MARKET_ADDRESS;
  if (!signalMarketAddr) throw new Error("SIGNAL_MARKET_ADDRESS not set");

  console.log("Deploying Groth16Verifier...");
  const V = await ethers.getContractFactory("Groth16Verifier");
  const v = await V.deploy();
  await v.waitForDeployment();
  const verifierAddr = await v.getAddress();
  console.log("  Groth16Verifier:", verifierAddr);

  // Sanity: the new verifier rejects the all-zero proof (the stub accepted it)
  const zero32 = [0n, 0n];
  const zero4  = [0n, 0n, 0n, 0n];
  const zero2x2 = [[0n, 0n], [0n, 0n]];
  let acceptsZero;
  try {
    acceptsZero = await v.verifyProof(zero32, zero2x2, zero32, zero4);
  } catch (e) {
    acceptsZero = false;
  }
  console.log("  acceptsAllZeroProof:", acceptsZero, "(must be false — sanity check)");

  console.log("\nSwapping verifier into SignalMarket...");
  const market = await ethers.getContractAt("SignalMarket", signalMarketAddr);
  const oldVerifier = await market.zkVerifier();
  console.log("  current zkVerifier:", oldVerifier);
  const tx = await market.setVerifier(verifierAddr);
  console.log("  tx:", tx.hash);
  await tx.wait();
  const newVerifier = await market.zkVerifier();
  console.log("  new zkVerifier:    ", newVerifier);
  console.log(newVerifier.toLowerCase() === verifierAddr.toLowerCase() ? "✓ swap confirmed" : "✗ swap mismatch");

  console.log("\nUpdate .env:");
  console.log(`ZK_VERIFIER_ADDRESS=${verifierAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
