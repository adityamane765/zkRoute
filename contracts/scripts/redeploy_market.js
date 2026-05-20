/**
 * Redeploy ONLY the contracts that changed for the blocker #1 fix:
 *   - CommitReveal (new verifySignalBatch + revealedCount)
 *   - SignalMarket (new submitStatsProof signature; constructor needs new CR addr)
 *
 * Keeps existing:
 *   - USDC
 *   - ProviderRegistry  (provider stake is still active here)
 *   - Verifier (Groth16) — independent of the market
 *
 *   npx hardhat run scripts/redeploy_market.js --network arc
 */
const { ethers, network } = require("hardhat");

async function main() {
  const usdc     = process.env.USDC_ADDRESS;
  const registry = process.env.PROVIDER_REGISTRY_ADDRESS;
  const verifier = process.env.ZK_VERIFIER_ADDRESS;
  if (!usdc || !registry || !verifier) throw new Error("missing addresses in env");

  const [deployer] = await ethers.getSigners();
  console.log("Network: ", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Reusing:");
  console.log("  USDC:             ", usdc);
  console.log("  ProviderRegistry: ", registry);
  console.log("  Verifier (Groth16):", verifier);

  console.log("\n→ Deploying new CommitReveal…");
  const CR = await ethers.getContractFactory("CommitReveal");
  const cr = await CR.deploy();
  await cr.waitForDeployment();
  const crAddr = await cr.getAddress();
  console.log("  CommitReveal:", crAddr);

  console.log("\n→ Deploying new SignalMarket…");
  const SM = await ethers.getContractFactory("SignalMarket");
  const sm = await SM.deploy(usdc, registry, crAddr, verifier);
  await sm.waitForDeployment();
  const smAddr = await sm.getAddress();
  console.log("  SignalMarket:", smAddr);

  console.log("\nUpdate .env:");
  console.log(`COMMIT_REVEAL_ADDRESS=${crAddr}`);
  console.log(`SIGNAL_MARKET_ADDRESS=${smAddr}`);
  console.log(`NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=${crAddr}`);
  console.log(`NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=${smAddr}`);

  // Write both addresses to a file for the next steps to consume
  const fs = require("fs");
  fs.writeFileSync("/tmp/new_addrs.json", JSON.stringify({ commitReveal: crAddr, signalMarket: smAddr }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
