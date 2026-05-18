/**
 * Registers the provider on-chain (stakes 100 USDC) and subscribes the deployer
 * as a buyer (authorizes the buyer agent, deposits 10 USDC float). Idempotent:
 * re-running after registration prints "already registered" and continues.
 *
 *   npx hardhat run scripts/init_demo.js --network arc
 */
const { ethers } = require("hardhat");

const PROVIDER_AGENT_ADDR = "0xbb93f8e5A6e42378dcA33953Fa46419263Dc7cc6";
const BUYER_AGENT_ADDR    = "0xc193d906250390F19C2a907c85586C12fc264840";
const PROVIDER_NACL_PUBKEY = "0xe5d66ccb16d434aadf3147747346cc034d44bcc6db5106f258b6364d2815a53a";
const BUYER_NACL_PUBKEY    = "0xcb6e46e67a7f5260e48c009b6dc4a833e4420dd4e5692ead66013564d140ba3a";

// Provider registers from THEIR OWN wallet — we use the provider's funded EOA.
// The deployer plays the role of buyer.
async function main() {
  const provider = new ethers.Wallet(process.env.PROVIDER_AGENT_PRIVATE_KEY, ethers.provider);
  const [buyer]  = await ethers.getSigners();

  const registry = await ethers.getContractAt("ProviderRegistry", process.env.PROVIDER_REGISTRY_ADDRESS);
  const market   = await ethers.getContractAt("SignalMarket",     process.env.SIGNAL_MARKET_ADDRESS);
  const usdc     = await ethers.getContractAt("MockERC20",        process.env.USDC_ADDRESS);

  console.log("Provider EOA:", provider.address);
  console.log("Buyer EOA   :", buyer.address);
  console.log();

  // ── 1. PROVIDER REGISTER ──────────────────────────────────────────────
  const existing = await registry.getProvider(provider.address);
  if (existing.active) {
    console.log("== Provider already active — skipping register ==");
  } else {
    console.log("== Provider: approve + register ==");
    const stake = await registry.STAKE_AMOUNT();
    const txA = await usdc.connect(provider).approve(await registry.getAddress(), stake);
    await txA.wait();
    console.log(`  approve tx: ${txA.hash}`);
    const txR = await registry.connect(provider).register(
      "ETH Momentum Alpha",
      "Medium-frequency ETH/BTC strategy using oracle-derived directional signals.",
      2,                              // MediumFrequency
      PROVIDER_NACL_PUBKEY
    );
    await txR.wait();
    console.log(`  register tx: ${txR.hash}`);
  }

  // ── 2. BUYER SUBSCRIBE ────────────────────────────────────────────────
  const sub = await market.getSubscription(provider.address, buyer.address);
  if (sub.active) {
    console.log("\n== Buyer already subscribed — skipping subscribe ==");
  } else {
    console.log("\n== Buyer: approve + subscribe (10 USDC float) ==");
    const float = 10_000000n;                 // 10 USDC
    const txA = await usdc.connect(buyer).approve(await market.getAddress(), float);
    await txA.wait();
    console.log(`  approve tx: ${txA.hash}`);
    const txS = await market.connect(buyer).subscribe(
      provider.address,         // provider
      BUYER_AGENT_ADDR,         // authorize the buyer-agent EOA
      BUYER_NACL_PUBKEY,        // pubkey to encrypt to
      500,                      // maxPositionBps = 5%
      10000,                    // maxLeverageBps = 1x
      300,                      // dailyVarBps = 3%
      float                     // initial float
    );
    await txS.wait();
    console.log(`  subscribe tx: ${txS.hash}`);
  }

  // ── 3. VERIFY ──────────────────────────────────────────────────────────
  const p = await registry.getProvider(provider.address);
  const s = await market.getSubscription(provider.address, buyer.address);
  console.log("\n== State ==");
  console.log(`  provider.active:  ${p.active}`);
  console.log(`  provider.name:    "${p.name}"`);
  console.log(`  subscription.active:        ${s.active}`);
  console.log(`  subscription.agent:         ${s.agent}`);
  console.log(`  subscription.float (USDC):  ${Number(s.float) / 1e6}`);
  console.log(`  subscription.maxPositionBps: ${s.maxPositionBps}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
