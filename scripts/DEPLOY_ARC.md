# Arc testnet deploy walkthrough

You have everything except three pieces of information only you can provide.
Fill those in, run two commands, paste the output back into the .env and JSON
file. Done.

---

## What's already in `.env`

- ✅ Fresh provider + buyer agent keypairs (EVM + NaCl)
- ✅ Backend secret + API config
- ✅ Pyth + x402 + Circle endpoint URLs
- ✅ Default Arc network params (verify before deploying!)

## What YOU need to fill in

Open [`/Users/swarnimraj/zkRoute/.env`](../.env) and replace the values below:

### 1. Deployer wallet

```env
ARC_PRIVATE_KEY=0xYOUR_FUNDED_DEPLOYER_KEY
```

- This wallet pays gas to deploy the four contracts.
- This wallet becomes the **owner** of `ProviderRegistry` and `SignalMarket`.
  Once you have a multisig, transfer ownership to it.
- Fund it from the Arc testnet faucet at `https://faucet.arc.network`
  (or whatever the official URL is — confirm in your Arc dashboard tab).

### 2. Arc network params — VERIFY

```env
ARC_RPC_URL=https://rpc.arc.network
ARC_CHAIN_ID=421614
```

I used the values from `.env.example` as starting placeholders. Cross-check
both against your Circle Arc documentation (you have that tab open). If they
differ:

```bash
# Open .env in your editor, fix both, and also fix the mirror:
NEXT_PUBLIC_ARC_RPC_URL=...
NEXT_PUBLIC_ARC_CHAIN_ID=...
```

### 3. USDC address on Arc

```env
USDC_ADDRESS=0x...
```

On Arc, USDC is pre-deployed by Circle. The address is documented in their
developer console. If you leave this empty, the deploy script will deploy a
`MockERC20` instead — fine for end-to-end testing, but not "real" USDC.

### 4. Circle Programmable Wallets (optional now, needed for live trades)

```env
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_ID=
```

Without these, the buyer agent runs in **simulation mode** (logs would-be
trades but doesn't execute). That's fine for the contract + ZK flow demo;
mandatory for end-to-end with real Circle wallets.

---

## Deploy command

Once `.env` is filled:

```bash
cd /Users/swarnimraj/zkRoute/contracts
npm run deploy:arc
```

Expected output (last block):

```
ProviderRegistry: 0x...
CommitReveal:     0x...
Verifier (STUB):  0x...
SignalMarket:     0x...

Add to .env:
USDC_ADDRESS=...
PROVIDER_REGISTRY_ADDRESS=0x...
COMMIT_REVEAL_ADDRESS=0x...
SIGNAL_MARKET_ADDRESS=0x...
ZK_VERIFIER_ADDRESS=0x...
```

⚠️ If the script halts with **"ZK_VERIFIER_ADDRESS must be set when deploying
to arc"**, you have two paths:

- **Recommended (testnet only):** comment out the safety check in
  `contracts/scripts/deploy.js` (the `if (network.name === "arc") throw ...`
  block). The stub verifier will be deployed. You can swap in the real
  verifier later via `setVerifier`.
- **Production:** run `cd circuits && npm run setup`, deploy
  `Verifier.sol` separately, and set `ZK_VERIFIER_ADDRESS` in `.env` before
  re-running.

---

## After the deploy

### 1. Paste addresses into `.env`

```env
PROVIDER_REGISTRY_ADDRESS=0xabc...    # from deploy output
COMMIT_REVEAL_ADDRESS=0xdef...
SIGNAL_MARKET_ADDRESS=0xghi...
ZK_VERIFIER_ADDRESS=0xjkl...
```

And mirror the NEXT_PUBLIC versions for the frontend:

```env
NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS=0xabc...
NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=0xghi...
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0xdef...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

### 2. Update the canonical JSON

Edit [`/Users/swarnimraj/zkRoute/deployments/arc-testnet.json`](../deployments/arc-testnet.json)
— replace each `"address": "0x0000...0000"` with the deployed address, and set
`"deployedAt"` to the timestamp. Commit this file.

### 3. Smoke test the chain

```bash
# (still in contracts/)
npx hardhat console --network arc
> const r = await ethers.getContractAt("ProviderRegistry", process.env.PROVIDER_REGISTRY_ADDRESS)
> await r.STAKE_AMOUNT()    // → 100000000n (100 USDC, 6 decimals)
> await r.getActiveProviders()    // → []
```

### 4. Start the system

```bash
# From repo root
cd backend && pip install -r requirements.txt && uvicorn backend.main:app --reload --port 8000 &
cd ../frontend && npm install && npm run dev &
# In a third terminal:
python -m agents.provider.agent
# In a fourth:
python -m agents.buyer.agent
```

### 5. Register the first provider on-chain

Either via the frontend at `http://localhost:3000/provider`, or directly:

```bash
cd /Users/swarnimraj/zkRoute/contracts
npx hardhat console --network arc
> const usdc = await ethers.getContractAt("MockERC20", process.env.USDC_ADDRESS)  # or IERC20 if real USDC
> const r = await ethers.getContractAt("ProviderRegistry", process.env.PROVIDER_REGISTRY_ADDRESS)
> await usdc.approve(await r.getAddress(), 100_000000n)
> await r.register(
    "ETH Momentum Alpha",
    "Medium-frequency ETH strategy",
    2,                  // MediumFrequency
    "0x" + process.env.PROVIDER_AGENT_PUBLIC_KEY
  )
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: missing private key for "arc"` | `ARC_PRIVATE_KEY` empty | Fill it in `.env` |
| `insufficient funds` | Deployer wallet not funded | Faucet → deployer EVM address |
| Deploy halts with `ZK_VERIFIER_ADDRESS must be set` | Stub-verifier safety guard | See note above |
| `Error: nonce too low` | Pending tx from earlier attempt | Wait a minute or bump nonce in hardhat config |
| `Error: cannot estimate gas` | Likely a contract revert | Use `--verbose` in `hardhat run`; usually means a `require` check is failing |
