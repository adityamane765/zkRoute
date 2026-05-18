require("@nomicfoundation/hardhat-toolbox");
const path = require("path");

// Load the repo-root .env regardless of where hardhat is invoked from.
// dotenv is optional at runtime — if it's missing (e.g. fresh checkout, deps
// not installed) we silently fall back to whatever's already in process.env.
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch (_) {
  // dotenv isn't installed yet — that's fine for `npm install` itself
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    arc: {
      url: process.env.ARC_RPC_URL || "https://rpc.arc.network",
      chainId: parseInt(process.env.ARC_CHAIN_ID || "421614"),
      accounts: process.env.ARC_PRIVATE_KEY ? [process.env.ARC_PRIVATE_KEY] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};
