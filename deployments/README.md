# deployments/

Canonical record of every deployed instance of zkRoute.

One JSON file per network. **Always update this folder when you deploy**, then
run [`../scripts/load_addresses.sh`](../scripts/load_addresses.sh) to propagate
the addresses into your `.env`.

| File | Network |
|------|---------|
| [`arc-testnet.json`](arc-testnet.json) | Arc Sepolia / testnet |
| `arc-mainnet.json`  *(future)* | Arc mainnet |
| `hardhat-local.json` *(optional)* | A pinned local-deploy snapshot if you want reproducible local testing |

## Schema

```jsonc
{
  "network": {
    "name":      "Arc Sepolia (testnet)",
    "chainId":    421614,
    "rpcUrl":    "https://rpc.arc.network",
    "wsUrl":     "wss://rpc.arc.network",
    "explorer":  "https://explorer.arc.network",
    "faucet":    "https://faucet.arc.network"
  },
  "contracts": {
    "USDC":              { "address": "0x...", "deployedAt": "2026-05-18T20:00:00Z" },
    "ProviderRegistry":  { "address": "0x...", "deployedAt": "..." },
    "CommitReveal":      { "address": "0x...", "deployedAt": "..." },
    "Verifier":          { "address": "0x...", "deployedAt": "..." },
    "SignalMarket":      { "address": "0x...", "deployedAt": "..." }
  },
  "owner": {
    "deployer":   "0x...",
    "treasury":   "0x..."
  },
  "circle": {
    "paymasterEndpoint": "https://api.circle.com/v1/w3s/paymaster",
    "x402Facilitator":   "https://x402.org/facilitator"
  }
}
```

`_status` and `_note` keys are optional — anything starting with `_` is
treated as a comment and ignored by `scripts/load_addresses.sh`.

## After a deploy

```bash
cd contracts && npm run deploy:arc 2>&1 | tee /tmp/deploy.log
```

The deploy script prints every address it produces. Paste them into the JSON
file under the corresponding key. Commit the change in a PR titled
`chore: arc-testnet deploy <date>` — the commit then serves as a versioned
record of which address corresponds to which code revision.

## Verifying

```bash
# does the on-chain code match the source?
cast code $(jq -r '.contracts.ProviderRegistry.address' deployments/arc-testnet.json) \
  --rpc-url $(jq -r '.network.rpcUrl' deployments/arc-testnet.json) | head -c 200

# is the Verifier still the stub?
cast call $(jq -r '.contracts.Verifier.address' deployments/arc-testnet.json) \
  "IS_STUB()(bool)" \
  --rpc-url $(jq -r '.network.rpcUrl' deployments/arc-testnet.json)
```

If `IS_STUB()` returns `true`, you have not yet swapped in the real Groth16
verifier. See [circuits/README.md](../circuits/README.md) for the swap
procedure.
