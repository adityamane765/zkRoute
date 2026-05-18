# zkRoute — Deployment & Setup

End-to-end checklist for taking this repo from a fresh clone to a running marketplace
with on-chain stakes, encrypted signal relay, and ZK-verified track records.

The order matters: contracts must exist before the agents can read their ABIs, and
the frontend must know the deployed addresses before any on-chain call works.

---

## 0. Toolchain

Required:

- **Node** ≥ 18 (for Hardhat, snarkjs, Next.js)
- **Python** 3.11
- **Rust + circom 2.1.6** (only needed to build the ZK circuit yourself; can be deferred
  during development since `Verifier.sol` ships as a permissive stub)
- **snarkjs** ≥ 0.7 — `npm i -g snarkjs`
- **Arc RPC access** (or any EVM-compatible RPC for local development)
- **Circle dashboard account** for Programmable Wallets + entity secret

Run the bootstrap script:

```bash
bash scripts/setup.sh
```

It installs the per-subtree dependencies and copies `.env.example` → `.env`. Fill in
keys before continuing.

---

## 1. Smart contracts

### 1a. Compile + test (no chain required)

```bash
cd contracts
npm install
npm run compile
npm test           # runs Hardhat tests in contracts/test
```

The test suite covers:
- ProviderRegistry: registration, stake handling, slashing, pause
- CommitReveal: commit/reveal flow, replay protection, window bounds
- SignalMarket: subscription bounds, agent authorization, fee accounting, pause

### 1b. Deploy

For a local Hardhat node:

```bash
npx hardhat node              # in one terminal
npm run deploy:local          # in another
```

For Arc testnet:

```bash
export ARC_PRIVATE_KEY=0x...
npm run deploy:arc
```

Copy the printed addresses into `.env`:

```
USDC_ADDRESS=...
PROVIDER_REGISTRY_ADDRESS=...
COMMIT_REVEAL_ADDRESS=...
SIGNAL_MARKET_ADDRESS=...
ZK_VERIFIER_ADDRESS=...    # stub by default; replace once circuit is ready
```

Also set the public-side mirrors in `frontend/.env.local`:

```
NEXT_PUBLIC_USDC_ADDRESS=...
NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS=...
NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=...
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_ARC_CHAIN_ID=1234
```

> **Important:** the deployed `Verifier.sol` is a permissive stub that accepts any
> proof. It exists so the rest of the system can be deployed and exercised before
> the trusted setup is run. **Do not use the stub on mainnet.** See §2.

---

## 2. ZK circuit & verifier

Run once:

```bash
cd circuits
npm install
npm run setup              # ~10 minutes — produces build/track_record_final.zkey
                           # and ../contracts/contracts/Verifier.sol
```

Then redeploy the verifier and swap it into the SignalMarket:

```bash
cd ../contracts
# In a hardhat script or CLI, deploy the new Verifier and call
#   signalMarket.setVerifier(newAddress)
# from the SignalMarket owner.
```

The deploy script in `scripts/deploy.js` refuses to deploy with the stub on
`network=arc` — set `ZK_VERIFIER_ADDRESS` first.

### Generating a proof for a provider

```bash
cd circuits
node scripts/prove.js --signals signals.json --out proof.json
```

`signals.json` is produced by the provider agent (`provider/agent.py`
`save_signal_history`). The output `proof.json.calldata` field is what the provider
passes to `SignalMarket.submitStatsProof`.

---

## 3. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Tests

```bash
pytest                     # tests run against an in-memory SQLite per test
```

Endpoints exposed:

| Method | Path | Notes |
|--------|------|-------|
| POST | `/providers/register` | mirror of on-chain registration |
| GET  | `/providers/` | list active providers |
| PATCH | `/providers/{addr}/stats` | requires EIP-191 signature from provider |
| POST | `/buyer/subscribe` | mirror of on-chain subscribe |
| POST | `/signals/relay` | provider agent posts encrypted signal |
| GET  | `/signals/pending/{buyer}` | buyer agent polls |

---

## 4. Agents

```bash
cd agents
pip install -e ".[dev]"
pytest                     # tests in agents/tests
```

To run the agents you must have a deployed set of contracts (so `_load_abi` can
read the JSON artifacts from `contracts/artifacts/...`).

```bash
python -m agents.provider.agent
python -m agents.buyer.agent
```

Each requires its environment block from `.env` (see `.env.example`).

### Important: buyer agent authorization

The buyer agent has its own wallet (`BUYER_AGENT_PRIVATE_KEY`). The buyer must
authorize that wallet on-chain via `SignalMarket.subscribe(..., agent, ...)` or
`SignalMarket.updateAgent(provider, newAgent)`. Until the agent is authorized,
`processSignalPayment` reverts with `not authorized` even though signals are still
encrypted to its NaCl pubkey.

---

## 5. Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:3000
```

The frontend reads `NEXT_PUBLIC_*` addresses to enable on-chain calls. If
`NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS` is the zero address, the provider page
falls back to a backend-only registration flow (no stake), and the subscribe
modal hides the on-chain fields. This is fine for local UI iteration but should
never be used in production.

---

## 6. Production checklist

Before opening to real money:

- [ ] Run the real trusted setup; redeploy `Verifier.sol`; call `setVerifier` on
      SignalMarket; verify `IS_STUB()` is not callable on the new verifier.
- [ ] Audit ProviderRegistry, CommitReveal, SignalMarket — particularly the
      treasury-vs-float separation in SignalMarket and the slashed-vs-active
      separation in ProviderRegistry.
- [ ] Configure a real owner multisig for both contracts (set deployer → multisig
      via `transferOwnership`).
- [ ] Move the backend off SQLite to Postgres; the SQLModel models work as-is.
- [ ] Put the backend behind HTTPS + rate limiting; tighten CORS in `main.py`.
- [ ] Pin the buyer agent's `Authorization: Bearer ...` for backend writes
      (currently the relay endpoint trusts any caller with a valid subscription —
      acceptable for MVP since the buyer's NaCl key still gates decryption).
- [ ] Replace the in-process signal relay with a queue (NATS/Redis) so a backend
      restart can't drop unread encrypted signals.
- [ ] Validate Pyth feed staleness in the agents before treating a price as
      ground truth for the reveal step.
- [ ] Wire `withdrawSlashedFunds` / `withdrawFees` to the protocol treasury
      multisig — not the deployer EOA.
