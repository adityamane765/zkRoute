/**
 * Deploy a fresh SignalMarket only — reuse the existing USDC, ProviderRegistry,
 * CommitReveal (with 100 revealed signals from earlier work), and pass the new
 * winCount Groth16Verifier directly into the constructor (skips a setVerifier
 * call). For blockers #3 + #4 + #6.
 *
 *   ZKROUTE_ALLOW_STUB_VERIFIER=true \
 *     npx hardhat run scripts/deploy_signalmarket_only.js --network arc
 */
const { ethers } = require("hardhat");

const USDC             = "0x999f73DeA290960Afbd2f6e582F48bEfdFfDB6Ed";
const PROVIDER_REGISTRY = "0x932Cb43D99e1CFB5D275Be0c87FA3313f76a6aeE";
const COMMIT_REVEAL    = "0x257beDCe2D5D1e806E936B87699BC637f0b08b60";   // has 100 reveals
const VERIFIER         = "0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229";   // winCount circuit

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Reusing:");
  console.log("  USDC:             ", USDC);
  console.log("  ProviderRegistry: ", PROVIDER_REGISTRY);
  console.log("  CommitReveal:     ", COMMIT_REVEAL, "(100 revealed signals already)");
  console.log("  Verifier (winCount):", VERIFIER);

  const SM = await ethers.getContractFactory("SignalMarket");
  const sm = await SM.deploy(USDC, PROVIDER_REGISTRY, COMMIT_REVEAL, VERIFIER);
  await sm.waitForDeployment();
  const addr = await sm.getAddress();
  console.log("\nSignalMarket:", addr);

  const live = await sm.zkVerifier();
  if (live.toLowerCase() !== VERIFIER.toLowerCase()) throw new Error("verifier mismatch");
  console.log("zkVerifier():", live, "✓ matches winCount verifier");

  const fs = require("fs");
  fs.writeFileSync("/tmp/new_signalmarket.txt", addr);
  console.log("\nUpdate .env:");
  console.log(`SIGNAL_MARKET_ADDRESS=${addr}`);
  console.log(`NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=${addr}`);
  console.log(`ZK_VERIFIER_ADDRESS=${VERIFIER}`);
  console.log(`NEXT_PUBLIC_ZK_VERIFIER_ADDRESS=${VERIFIER}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
