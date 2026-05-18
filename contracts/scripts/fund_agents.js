/**
 * Fund the provider + buyer agent EVM addresses from the deployer:
 *   - 5 native (gas) each
 *   - 200 MockUSDC to provider (100 stake + buffer)
 *   -  50 MockUSDC to buyer    (float)
 *
 * Pure on-chain transfers, idempotent in the sense that running it twice just
 * over-funds the agents.
 */
const { ethers } = require("hardhat");

const PROVIDER = "0xbb93f8e5A6e42378dcA33953Fa46419263Dc7cc6";
const BUYER    = "0xc193d906250390F19C2a907c85586C12fc264840";

const NATIVE_PER_AGENT = ethers.parseEther("5");      // 5 native units
const PROVIDER_USDC    = 200_000000n;                 // 200 USDC (6 decimals)
const BUYER_USDC       =  50_000000n;                 // 50 USDC

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding from:", deployer.address);

  const usdc = await ethers.getContractAt("MockERC20", process.env.USDC_ADDRESS);

  // 1. Native gas
  console.log("\n== Native gas ==");
  for (const dest of [PROVIDER, BUYER]) {
    const tx = await deployer.sendTransaction({ to: dest, value: NATIVE_PER_AGENT });
    console.log(`  → ${dest}: ${ethers.formatEther(NATIVE_PER_AGENT)} native (tx: ${tx.hash})`);
    await tx.wait();
  }

  // 2. MockUSDC
  console.log("\n== MockUSDC ==");
  const tx1 = await usdc.transfer(PROVIDER, PROVIDER_USDC);
  console.log(`  → provider: 200 USDC (tx: ${tx1.hash})`);
  await tx1.wait();
  const tx2 = await usdc.transfer(BUYER, BUYER_USDC);
  console.log(`  → buyer:     50 USDC (tx: ${tx2.hash})`);
  await tx2.wait();

  // 3. Verify balances
  console.log("\n== Verification ==");
  for (const [label, addr] of [["provider", PROVIDER], ["buyer", BUYER]]) {
    const nat = await ethers.provider.getBalance(addr);
    const usd = await usdc.balanceOf(addr);
    console.log(`  ${label}: native=${ethers.formatEther(nat)}  USDC=${Number(usd) / 1e6}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
