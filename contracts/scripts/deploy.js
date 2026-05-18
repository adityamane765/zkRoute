const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Network:", network.name);
  console.log("Deploying with:", deployer.address);

  // On Arc, real USDC is already deployed. Set USDC_ADDRESS in .env or fall back to a mock for local.
  const usdcAddress = process.env.USDC_ADDRESS || (await deployMockUsdc(deployer));

  // 1. ProviderRegistry
  const Registry = await ethers.getContractFactory("ProviderRegistry");
  const registry = await Registry.deploy(usdcAddress);
  await registry.waitForDeployment();
  console.log("ProviderRegistry:", await registry.getAddress());

  // 2. CommitReveal
  const CommitReveal = await ethers.getContractFactory("CommitReveal");
  const commitReveal = await CommitReveal.deploy();
  await commitReveal.waitForDeployment();
  console.log("CommitReveal:", await commitReveal.getAddress());

  // 3. ZK Verifier
  //    Use ZK_VERIFIER_ADDRESS from env if a real verifier is already deployed.
  //    Otherwise deploy the stub Verifier.sol (placeholder). On `arc` mainnet we
  //    require a real verifier to be supplied.
  let zkVerifierAddress = process.env.ZK_VERIFIER_ADDRESS;
  if (!zkVerifierAddress) {
    // The stub Verifier accepts any proof. It is safe for testnet wiring and
    // hostile on mainnet. Require explicit opt-in via env when targeting a
    // network that is not a local dev chain.
    const isLocal = network.name === "localhost" || network.name === "hardhat";
    if (!isLocal && process.env.ZKROUTE_ALLOW_STUB_VERIFIER !== "true") {
      throw new Error(
        `ZK_VERIFIER_ADDRESS is unset and ZKROUTE_ALLOW_STUB_VERIFIER!=true on network=${network.name}. ` +
        `Either deploy the real Verifier first (cd ../circuits && npm run setup) and set ZK_VERIFIER_ADDRESS, ` +
        `or set ZKROUTE_ALLOW_STUB_VERIFIER=true to deploy the stub. The stub MUST NOT be used on mainnet.`
      );
    }
    // snarkjs's exported Verifier.sol declares the contract as `Groth16Verifier`.
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    zkVerifierAddress = await verifier.getAddress();
    console.log("Verifier (STUB):", zkVerifierAddress, "⚠️  SWAP BEFORE MAINNET");
  } else {
    console.log("Verifier (env):", zkVerifierAddress);
  }

  // 4. SignalMarket
  const Market = await ethers.getContractFactory("SignalMarket");
  const market = await Market.deploy(
    usdcAddress,
    await registry.getAddress(),
    await commitReveal.getAddress(),
    zkVerifierAddress
  );
  await market.waitForDeployment();
  console.log("SignalMarket:", await market.getAddress());

  console.log("\nAdd to .env:");
  console.log(`USDC_ADDRESS=${usdcAddress}`);
  console.log(`PROVIDER_REGISTRY_ADDRESS=${await registry.getAddress()}`);
  console.log(`COMMIT_REVEAL_ADDRESS=${await commitReveal.getAddress()}`);
  console.log(`SIGNAL_MARKET_ADDRESS=${await market.getAddress()}`);
  console.log(`ZK_VERIFIER_ADDRESS=${zkVerifierAddress}`);
}

async function deployMockUsdc(deployer) {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mock = await MockERC20.deploy("USD Coin", "USDC", 6);
  await mock.waitForDeployment();
  const addr = await mock.getAddress();
  console.log("MockUSDC:", addr);
  // Mint 10M USDC to deployer for testing
  await mock.mint(deployer.address, ethers.parseUnits("10000000", 6));
  return addr;
}

main().catch((e) => { console.error(e); process.exit(1); });
