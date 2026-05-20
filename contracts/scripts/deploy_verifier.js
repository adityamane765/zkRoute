const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying verifier with:", deployer.address);

  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const addr = await verifier.getAddress();
  console.log("New Verifier:", addr);
  console.log("\nUpdate .env: ZK_VERIFIER_ADDRESS=" + addr);
  console.log("\nNOTE: You also need to call SignalMarket.setVerifier(newAddr) or redeploy SignalMarket.");
}

main().catch((e) => { console.error(e); process.exit(1); });
