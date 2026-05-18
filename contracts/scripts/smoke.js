const { ethers } = require("hardhat");

async function main() {
  const reg  = await ethers.getContractAt("ProviderRegistry", process.env.PROVIDER_REGISTRY_ADDRESS);
  const cr   = await ethers.getContractAt("CommitReveal",     process.env.COMMIT_REVEAL_ADDRESS);
  const ver  = await ethers.getContractAt("Verifier",         process.env.ZK_VERIFIER_ADDRESS);
  const mkt  = await ethers.getContractAt("SignalMarket",     process.env.SIGNAL_MARKET_ADDRESS);
  const usdc = await ethers.getContractAt("MockERC20",        process.env.USDC_ADDRESS);

  console.log("=== ProviderRegistry ===");
  console.log("  STAKE_AMOUNT:", (await reg.STAKE_AMOUNT()).toString(), "(100 USDC = 100000000)");
  console.log("  active providers:", (await reg.getActiveProviders()).length);

  console.log("\n=== CommitReveal ===");
  console.log("  MIN_REVEAL_DELAY_BLOCKS:", (await cr.MIN_REVEAL_DELAY_BLOCKS()).toString());
  console.log("  MAX_REVEAL_WINDOW_BLOCKS:", (await cr.MAX_REVEAL_WINDOW_BLOCKS()).toString());

  console.log("\n=== Verifier (stub) ===");
  console.log("  IS_STUB:", await ver.IS_STUB(), "(must be true)");

  console.log("\n=== SignalMarket ===");
  console.log("  signalPriceUsdc:", (await mkt.signalPriceUsdc()).toString(), "(0.01 USDC = 10000)");
  console.log("  PROTOCOL_FEE_BPS:", (await mkt.PROTOCOL_FEE_BPS()).toString(), "= 3%");
  console.log("  MAX_POSITION_BPS:", (await mkt.MAX_POSITION_BPS()).toString(), "= 50%");
  console.log("  zkVerifier:", await mkt.zkVerifier());
  console.log("  paused:", await mkt.paused());

  console.log("\n=== USDC (mock) ===");
  console.log("  symbol:", await usdc.symbol(), "decimals:", (await usdc.decimals()).toString());
  const [signer] = await ethers.getSigners();
  console.log("  deployer balance:", (await usdc.balanceOf(signer.address)).toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
