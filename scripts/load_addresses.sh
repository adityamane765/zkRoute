#!/usr/bin/env bash
# Emits .env-compatible lines from deployments/arc-testnet.json.
# Usage:
#   eval "$(scripts/load_addresses.sh)"          # export into current shell
#   scripts/load_addresses.sh >> .env             # append to .env
#
# Requires: jq

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/deployments/arc-testnet.json"

if ! command -v jq >/dev/null; then
  echo "error: jq required" >&2
  exit 1
fi

read_addr() { jq -r ".contracts.$1.address" "$FILE"; }
read_net()  { jq -r ".network.$1" "$FILE"; }

cat <<EOF
ARC_RPC_URL=$(read_net rpcUrl)
ARC_CHAIN_ID=$(read_net chainId)
USDC_ADDRESS=$(read_addr USDC)
PROVIDER_REGISTRY_ADDRESS=$(read_addr ProviderRegistry)
COMMIT_REVEAL_ADDRESS=$(read_addr CommitReveal)
SIGNAL_MARKET_ADDRESS=$(read_addr SignalMarket)
ZK_VERIFIER_ADDRESS=$(read_addr Verifier)
NEXT_PUBLIC_ARC_CHAIN_ID=$(read_net chainId)
NEXT_PUBLIC_ARC_RPC_URL=$(read_net rpcUrl)
NEXT_PUBLIC_USDC_ADDRESS=$(read_addr USDC)
NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS=$(read_addr ProviderRegistry)
NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=$(read_addr SignalMarket)
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=$(read_addr CommitReveal)
EOF
