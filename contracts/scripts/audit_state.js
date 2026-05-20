/**
 * Audit on-chain reality vs .env vs deployments/arc-testnet.json.
 *   ZKROUTE_ALLOW_STUB_VERIFIER=true npx hardhat run scripts/audit_state.js --network arc
 */
const { ethers } = require("hardhat");

async function code(addr) {
  const c = await ethers.provider.getCode(addr);
  return c === "0x" ? "(no code)" : `${(c.length - 2) / 2} bytes`;
}

async function main() {
  const candidates = {
    "USDC":             process.env.USDC_ADDRESS,
    "ProviderRegistry": process.env.PROVIDER_REGISTRY_ADDRESS,
    "CommitReveal":     process.env.COMMIT_REVEAL_ADDRESS,
    "SignalMarket":     process.env.SIGNAL_MARKET_ADDRESS,
    "Verifier (env)":   process.env.ZK_VERIFIER_ADDRESS,
    "Verifier (Aadi claim)": "0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229",
    "SignalMarket (orig)": "0x02c40758eB9932257F056fbB60714ccbdA8C4bd4",
  };
  console.log("=== Bytecode presence ===");
  for (const [n, a] of Object.entries(candidates)) {
    if (!a) continue;
    process.stdout.write(`  ${n.padEnd(25)} ${a}  `);
    console.log(await code(a));
  }

  console.log("\n=== Which verifier does the .env SignalMarket point to? ===");
  try {
    const sm = await ethers.getContractAt("SignalMarket", process.env.SIGNAL_MARKET_ADDRESS);
    const v  = await sm.zkVerifier();
    console.log(`  SignalMarket(${process.env.SIGNAL_MARKET_ADDRESS}).zkVerifier() = ${v}`);
    const aadi = "0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229";
    const orig = "0x403Fe0408976b518b2952BdF590135Ec6ba12ebc";
    if (v.toLowerCase() === aadi.toLowerCase()) console.log("  → matches the winCount verifier (Aadi's claim) ✓");
    else if (v.toLowerCase() === orig.toLowerCase()) console.log("  → matches the original winRateBps verifier ✗");
    else console.log("  → unknown verifier");

    const paused = await sm.paused();
    const price  = await sm.signalPriceUsdc();
    console.log(`  paused=${paused}, signalPriceUsdc=${price}`);
  } catch (e) {
    console.log(`  ✗ revert: ${e.shortMessage || e.message}`);
  }

  console.log("\n=== providerStats(0xbb93…7cc6) on the .env SignalMarket ===");
  try {
    const sm = await ethers.getContractAt("SignalMarket", process.env.SIGNAL_MARKET_ADDRESS);
    const s = await sm.providerStats("0xbb93f8e5A6e42378dcA33953Fa46419263Dc7cc6");
    console.log(`  field[0]:        ${s[0]}    (winCount OR winRateBps)`);
    console.log(`  field[1]:        ${s[1]}    (totalReturnBps)`);
    console.log(`  field[2]:        ${s[2]}    (totalSignals)`);
    console.log(`  field[3]:        ${s[3]}    (lastProofBlock)`);
  } catch (e) {
    console.log(`  ✗ revert: ${e.shortMessage || e.message}`);
  }

  console.log("\n=== revealedCount on the .env CommitReveal? ===");
  try {
    const cr = await ethers.getContractAt("CommitReveal", process.env.COMMIT_REVEAL_ADDRESS);
    const c  = await cr.revealedCount("0xbb93f8e5A6e42378dcA33953Fa46419263Dc7cc6");
    console.log(`  revealedCount = ${c}  (function exists → new contract)`);
  } catch (e) {
    console.log(`  ✗ revert: ${e.shortMessage || e.message}`);
    console.log("  (revealedCount doesn't exist → contract is the OLD version)");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
