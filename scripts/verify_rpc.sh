#!/usr/bin/env bash
# Probe ARC_RPC_URL from .env, confirm it's live, and compare against ARC_CHAIN_ID.
# Run from anywhere:  bash scripts/verify_rpc.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
[ -f "$ENV_FILE" ] || { echo "✗ $ENV_FILE not found"; exit 1; }

RPC=$(grep -E '^ARC_RPC_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
CID_EXPECTED=$(grep -E '^ARC_CHAIN_ID=' "$ENV_FILE" | head -1 | cut -d= -f2-)

[ -n "$RPC" ]         || { echo "✗ ARC_RPC_URL is empty in .env"; exit 1; }
[ -n "$CID_EXPECTED" ] || { echo "✗ ARC_CHAIN_ID is empty in .env"; exit 1; }

echo "Probing  ARC_RPC_URL  = $RPC"
echo "Expected ARC_CHAIN_ID = $CID_EXPECTED"
echo

RESP=$(curl -sS --max-time 10 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  "$RPC" 2>&1) || { echo "✗ curl failed: $RESP"; exit 1; }

HEX=$(echo "$RESP" | sed -n 's/.*"result":"\(0x[0-9a-fA-F]*\)".*/\1/p')
[ -n "$HEX" ] || { echo "✗ no eth_chainId in response: $RESP"; exit 1; }
DEC=$((HEX))

echo "RPC responded:"
echo "  chainId hex = $HEX"
echo "  chainId dec = $DEC"
echo

if [ "$DEC" = "$CID_EXPECTED" ]; then
  echo "✓ chainId matches ARC_CHAIN_ID in .env — safe to deploy."
else
  echo "✗ MISMATCH. RPC reports chainId=$DEC but .env says $CID_EXPECTED."
  echo "  Update ARC_CHAIN_ID and NEXT_PUBLIC_ARC_CHAIN_ID in .env to $DEC,"
  echo "  or change ARC_RPC_URL to a node serving the network you want."
  exit 1
fi
