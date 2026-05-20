const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const newVerifier = "0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229";
  const marketAddr = process.env.SIGNAL_MARKET_ADDRESS;
  if (!marketAddr) throw new Error("SIGNAL_MARKET_ADDRESS not set");
  const market = await ethers.getContractAt("SignalMarket", marketAddr, deployer);
  const tx = await market.setVerifier(newVerifier);
  await tx.wait();
  console.log("setVerifier tx:", tx.hash);
  console.log("SignalMarket verifier updated to:", newVerifier);
}

main().catch((e) => { console.error(e); process.exit(1); });
