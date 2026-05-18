# zkRoute — Session Updates

A running log of what was built, fixed, and deployed in this session.
Last refresh: **2026-05-19**.

---

## TL;DR

In one session, zkRoute went from "code skeleton with placeholder values" to:

- ✅ **All 5 contracts deployed and verified on Arc testnet (Canteen)**
- ✅ **Real Groth16 trusted setup completed**, real verifier deployed and swapped in via `setVerifier`
- ✅ **Full agent-to-agent pipeline running live** — Gemini → commit on-chain → encrypt → relay → decrypt → risk-validate → execute (sim) → report
- ✅ **4 live positions** in the buyer dashboard, signals committed/revealed every 60s
- ✅ **30/30 Hardhat tests passing** with isolated `MockVerifier`
- ✅ **Production-grade contract hardening** (reentrancy, pause, fee accounting, agent auth)
- ✅ **CI workflow** (Hardhat + pytest + Next.js build)
- ✅ **9 READMEs + DEPLOYMENT walkthrough + per-folder .gitignores**

---

## 1. Live Arc testnet deployment

**Network**

| Field | Value |
|-------|-------|
| Name | Arc Testnet (Canteen) |
| Chain ID | `5042002` (`0x4cef52`) |
| RPC | `https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_***` (auth token, in `.env`) |
| Explorer | https://docs.arc.io/ |
| Auth tool | `arc-canteen` CLI |
| Deployer | `0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859` |

**Contracts**

| Contract | Address | Source |
|----------|---------|--------|
| MockUSDC | `0x999f73DeA290960Afbd2f6e582F48bEfdFfDB6Ed` | [MockERC20.sol](contracts/contracts/MockERC20.sol) |
| ProviderRegistry | `0x932Cb43D99e1CFB5D275Be0c87FA3313f76a6aeE` | [ProviderRegistry.sol](contracts/contracts/ProviderRegistry.sol) |
| CommitReveal | `0x6e6c34e5781D45C5b0c91ecf258EAfaccc52fCDe` | [CommitReveal.sol](contracts/contracts/CommitReveal.sol) |
| **Groth16Verifier (real)** | **`0x403Fe0408976b518b2952BdF590135Ec6ba12ebc`** | [Verifier.sol](contracts/contracts/Verifier.sol) — snarkjs-exported |
| SignalMarket | `0x02c40758eB9932257F056fbB60714ccbdA8C4bd4` | [SignalMarket.sol](contracts/contracts/SignalMarket.sol) |

The verifier was deployed to a stub first, then swapped via `SignalMarket.setVerifier(...)` (tx `0x5a33893c…0bac175e`). Sanity-checked: rejects an all-zero proof.

Canonical record: [deployments/arc-testnet.json](deployments/arc-testnet.json).

**Demo state on-chain**

| Entity | Address | Status |
|--------|---------|--------|
| Provider "ETH Momentum Alpha" | `0xbb93f8e5…3Dc7cc6` | Registered, 100 USDC staked (`register` tx `0x6b35ab6a…3a7f847cb2`) |
| Buyer subscription | `0xc5b7b574…246d3859` | Active, 10 USDC float deposited, agent authorized (`subscribe` tx `0x433e97e1…fe68569077c5db90`) |
| Provider agent EOA | `0xbb93f8e5…3Dc7cc6` | 5 native gas + 200 MockUSDC |
| Buyer agent EOA | `0xc193d906…6C12fc264840` | 5 native gas + 50 MockUSDC |

---

## 2. Trusted setup ✓

Real Groth16 setup completed end-to-end:

| Step | Output |
|------|--------|
| Install circom from source | `circom 2.2.3` in `~/.cargo/bin/circom` |
| Compile [track_record.circom](circuits/zkroute/track_record.circom) | 50,800 non-linear + 61,703 linear constraints, 4 public + 500 private inputs |
| Download Powers-of-Tau Phase 1 | 288 MB `powersOfTau28_hez_final_18.ptau` from GCS mirror (Hermez S3 dead) |
| Groth16 setup + single contribution | 47 MB `track_record_final.zkey` |
| Export verification key | 3.4 KB `verification_key.json` |
| Export Solidity verifier | 8 KB `Verifier.sol` (snarkjs `Groth16Verifier` contract) |
| Deploy + swap on-chain | Verifier `0x403Fe04…` live |

> Currently a single dev contribution. For mainnet, replace with a multi-party ceremony.

---

## 3. Live demo running (foreground processes)

| Process | PID file | Log | Status |
|---------|----------|-----|--------|
| Backend (uvicorn) | (last pid in log) | `/tmp/zkroute_backend.log` | Running on `:8000` |
| Provider agent | running | `/tmp/zkroute_provider.log` | Generates ETH/BTC signals every 60s |
| Buyer agent | running | `/tmp/zkroute_buyer.log` | Polls every 30s, executes in sim mode |
| Frontend (Next.js) | running | `/tmp/zkroute_frontend.log` | `:3000` |

**Live observation:**

- **Gemini** generates directions (e.g. `ETH SHORT @ $2135.59`, `BTC LONG @ $76979.96`).
- Each commit lands on Arc with ~3-second finality.
- The buyer agent decrypts both signals on its next poll, validates against risk bounds, simulates the trade, and posts the position to `/buyer/positions`.
- The dashboard at `/buyer` (signed in as `0xc5b7…3859`) shows **4 open positions**, no PnL yet because the position-monitor loop runs every 5 min.
- Provider's `_reveal_loop` resolves each signal after the 30s reveal window using Pyth price-at-time, then writes the outcome to `/signals/outcome` and appends to `signal_history` (the input to the eventual ZK proof).

URLs:

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Landing |
| http://localhost:3000/marketplace | Provider list — "ETH Momentum Alpha" visible |
| http://localhost:3000/buyer | Portfolio dashboard (4 positions) |
| http://localhost:3000/provider | Register a new strategy (on-chain register flow) |
| http://localhost:8000/docs | Backend Swagger UI |
| http://localhost:8000/buyer/dashboard/0xc5b7…3859 | Raw dashboard JSON |

---

## 4. Bugs found & fixed in this session

| # | Bug | Where | Fix |
|---|-----|-------|-----|
| 1 | `processSignalPayment` required `msg.sender == buyer` — but the agent has its own key | [SignalMarket.sol](contracts/contracts/SignalMarket.sol) | Added `agent` field to Subscription + `onlyAgentOrBuyer` modifier. Agent address is set at subscribe time. |
| 2 | `withdrawFees(to)` could sweep buyer floats and provider revenue | [SignalMarket.sol](contracts/contracts/SignalMarket.sol) | Split accounting into `treasuryBalance`, `providerRevenue`, `subscriptions[].float`. Withdraw only takes treasury. |
| 3 | Slashed bond and active stakes lived in the same balance | [ProviderRegistry.sol](contracts/contracts/ProviderRegistry.sol) | Added `slashedBalance` separate from active stakes; `withdrawSlashedFunds` only touches slashed. |
| 4 | `getCommitmentRoot` was O(n) loop over all commits | [CommitReveal.sol](contracts/contracts/CommitReveal.sol) | Made it incremental via `commitmentRoot_` mapping; O(1) views. |
| 5 | Provider could keep a commitment open indefinitely and pick winners later | [CommitReveal.sol](contracts/contracts/CommitReveal.sol) | Added `MAX_REVEAL_WINDOW_BLOCKS = 50_000`. |
| 6 | Backend `/providers/{addr}/stats` accepted any caller | [providers.py](backend/routes/providers.py) | Now requires EIP-191 signature from the provider's wallet; rejects stale `last_proof_block`. |
| 7 | `signal_id` could be re-relayed via the backend | [signals.py](backend/routes/signals.py) | Dedup on `(provider, buyer, signal_id)` at relay time. |
| 8 | Encrypted payload size unbounded | [signals.py](backend/routes/signals.py) | 16 KiB cap. |
| 9 | `OrbCanvas.tsx` hit `Cannot read properties of null` on unmount | [OrbCanvas.tsx](frontend/components/OrbCanvas.tsx) | RAF loop checks `stopped` flag + re-reads refs each frame. |
| 10 | Hydration mismatch: server rendered "connect wallet", client showed address | [ConnectButton.tsx](frontend/components/ConnectButton.tsx) | Added `mounted` guard; same applied to `/buyer` and `/provider` pages. |
| 11 | `deploy.js` blew up with `Cannot find module 'dotenv'` | [contracts/package.json](contracts/package.json) | Added `dotenv` to devDeps + try/catch in hardhat.config.js. |
| 12 | `deploy.js` forbade stub verifier on `arc` network | [scripts/deploy.js](contracts/scripts/deploy.js) | Gated behind `ZKROUTE_ALLOW_STUB_VERIFIER=true` env flag for testnet. |
| 13 | Hardhat tests broke after swapping in real Groth16Verifier | [SignalMarket.test.js](contracts/test/SignalMarket.test.js) | Added `MockVerifier.sol` for unit tests. Real verifier is only used in production deploys. |
| 14 | Provider agent crashed: `Unknown kwargs: ['gasPrice']` (web3 v7) | [chain.py](agents/shared/chain.py) | Dropped legacy `gasPrice` — `build_transaction` already populates EIP-1559 fees. |
| 15 | Then: `Missing kwargs: ['nonce']` — `build_transaction` doesn't auto-fill nonce | [chain.py](agents/shared/chain.py) | Re-added explicit `nonce = w3.eth.get_transaction_count(...)`. |
| 16 | Buyer agent polled `/signals/pending/{agent_address}` but signals are stored against the **buyer's** address | [buyer/agent.py](agents/buyer/agent.py) | Added `BUYER_ADDRESS` env var separating the agent's signing identity from the buyer's principal identity. |
| 17 | `processSignalPayment` called with agent's address as `buyer` arg | [chain.py](agents/shared/chain.py), [buyer/agent.py](agents/buyer/agent.py) | New signature `process_signal_payment(account, provider, buyer)` — agent signs, buyer is the principal. |
| 18 | Anthropic SDK not wanted as dep | [provider/agent.py](agents/provider/agent.py), [pyproject.toml](agents/pyproject.toml) | Switched to `google-genai` (`gemini-2.5-flash`). Strips ``` fences from Gemini output. |
| 19 | Circuit included `../../node_modules/circomlib/...` (off by one) | [track_record.circom](circuits/zkroute/track_record.circom) | Now `../node_modules/circomlib/...`. |
| 20 | Hermez S3 ptau mirror returns 403 | [setup.sh](circuits/scripts/setup.sh) | Switched to GCS mirror `https://storage.googleapis.com/zkevm/ptau/`. |

---

## 5. Production hardening (contracts)

[SignalMarket.sol](contracts/contracts/SignalMarket.sol):

- `nonReentrant` on every USDC-moving call
- `whenNotPaused` everywhere user-callable
- `SafeERC20` for all token transfers
- Hard caps: `MAX_POSITION_BPS = 50%`, `MAX_LEVERAGE_BPS = 10x`, `MAX_DAILY_VAR_BPS = 20%`
- `MIN_PROOF_INTERVAL_BLOCKS = 10` — rate-limit proof submissions
- Mutable verifier via `setVerifier(addr)`, owner-only
- Three accounting bins: `treasuryBalance`, `providerRevenue[]`, `subscriptions[].float` — never mixed
- New `updateAgent`, `updateRiskBounds` post-subscription
- Pausable + setSignalPrice owner ops; sanity-capped at 1000 USDC/signal

[ProviderRegistry.sol](contracts/contracts/ProviderRegistry.sol):

- Pausable register flow
- Slashed addresses can't re-register
- Name/description length caps (80 / 500)
- Slashed funds isolated; treasury withdraw separate from active stakes

[CommitReveal.sol](contracts/contracts/CommitReveal.sol):

- Rolling root cached on commit (O(1) reads)
- Min + max reveal window blocks
- Zero-bytes guards on signalId and hash
- `direction` and `outcome` stored on reveal for audit

---

## 6. Tests

| Suite | Tool | Count | Result |
|-------|------|-------|--------|
| Contracts ([contracts/test/](contracts/test/)) | Hardhat + chai | 30 | ✓ All pass |
| Backend ([backend/tests/](backend/tests/)) | pytest + httpx TestClient | 18 | (Run `cd backend && pytest`) |
| Agents ([agents/tests/](agents/tests/)) | pytest | 12 | (Run `cd agents && pytest`) |

Hardhat coverage spans:

- ProviderRegistry: register / re-register / slash / deactivate / pause / treasury withdraw
- CommitReveal: commit / reveal happy path / replay / hash mismatch / max-window expiry / per-provider root isolation
- SignalMarket: subscribe bounds / agent vs buyer vs attacker auth / payment split (3% fee → treasury, 97% → revenue) / `withdrawFees` only takes treasury / `claimRevenue` only takes provider's revenue / pause / proof submission with `MockVerifier`

CI: [.github/workflows/ci.yml](.github/workflows/ci.yml) runs all three suites + a Next.js build on every push.

---

## 7. Files added or substantially changed

**New files**

```
.github/workflows/ci.yml                      ← CI pipeline (4 jobs)
DEPLOYMENT.md                                 ← full setup walkthrough
README.md                                     ← root project overview
UPDATES.md                                    ← this file

contracts/.gitignore
contracts/README.md                           ← every function/event/storage slot
contracts/contracts/MockVerifier.sol          ← test-only permissive verifier
contracts/contracts/Verifier.sol              ← real Groth16 (overwrites stub)
contracts/scripts/deploy_verifier.js          ← deploy + swap real verifier
contracts/scripts/fund_agents.js              ← fund agent EOAs with gas + USDC
contracts/scripts/init_demo.js                ← register provider + subscribe buyer
contracts/scripts/smoke.js                    ← read-only post-deploy sanity
contracts/test/CommitReveal.test.js
contracts/test/ProviderRegistry.test.js
contracts/test/SignalMarket.test.js

circuits/.gitignore
circuits/README.md                            ← circuit description + setup procedure

backend/.gitignore
backend/README.md                             ← every endpoint, hardening notes
backend/pytest.ini
backend/tests/conftest.py                     ← in-memory SQLite fixture
backend/tests/test_auth.py
backend/tests/test_buyer_flow.py
backend/tests/test_providers.py
backend/tests/test_signals.py

agents/.gitignore
agents/README.md                              ← provider + buyer loops in detail
agents/pytest.ini
agents/shared/risk.py                         ← pure risk-bounds module (testable)
agents/tests/test_crypto.py
agents/tests/test_risk.py

frontend/.gitignore
frontend/README.md
frontend/lib/contracts.ts                     ← minimal hand-maintained ABIs
frontend/lib/onchain.ts                       ← approve-then-call hooks

deployments/README.md
deployments/arc-testnet.json                  ← canonical address book

scripts/DEPLOY_ARC.md                         ← Arc-specific walkthrough
scripts/README.md
scripts/load_addresses.sh                     ← .env emitter from deployments JSON
scripts/verify_rpc.sh                         ← live-RPC + chain-ID probe
```

**Substantially rewritten**

```
.env                                          ← all 36 keys populated (gitignored)
.env.example                                  ← expanded with NEXT_PUBLIC_*
.gitignore                                    ← comprehensive top-level rules
contracts/contracts/SignalMarket.sol          ← agent auth, fee split, hardening
contracts/contracts/ProviderRegistry.sol      ← slashed isolation, pausable
contracts/contracts/CommitReveal.sol          ← rolling root, window bounds
contracts/scripts/deploy.js                   ← stub-verifier flag gate, OZ imports
contracts/hardhat.config.js                   ← cwd-independent dotenv load
backend/routes/buyers.py                      ← validation, dedup, address checksum
backend/routes/providers.py                   ← signed stats updates
backend/routes/signals.py                     ← payload caps, hex validation
agents/buyer/agent.py                         ← risk module, BUYER_ADDRESS split
agents/provider/agent.py                      ← Gemini, env-overridable timing
agents/shared/chain.py                        ← EIP-1559 tx building, agent auth
frontend/app/buyer/page.tsx                   ← hydration-safe mounted guard
frontend/app/provider/page.tsx                ← on-chain register flow
frontend/components/ConnectButton.tsx         ← hydration-safe
frontend/components/OrbCanvas.tsx             ← null-deref-safe RAF loop
frontend/components/SubscribeModal.tsx        ← on-chain subscribe + agent auth
```

---

## 8. Tools, libraries, services touched

| Layer | Tool | Version | Why |
|-------|------|---------|-----|
| Compiler | circom | 2.2.3 | Built from source via cargo |
| Proof system | snarkjs (Groth16) | 0.7.5 | Trusted setup + verifier export |
| Smart contracts | Hardhat + ethers v6 | 2.22 / 6.x | Test + deploy |
| Contracts | OpenZeppelin | 5.x | SafeERC20, Ownable, Pausable, ReentrancyGuard |
| Backend | FastAPI + SQLModel | 0.111 / 0.0.19 | Signal relay + marketplace |
| Frontend | Next.js + wagmi + viem | 14.2 / 2.9 / 2.13 | Marketplace UI |
| Wallet/SDK | Circle Programmable Wallets | (sim) | Trade execution (live mode pending creds) |
| Oracle | Pyth Hermes REST | live | ETH/BTC prices |
| Signal gen | Google Gemini | `gemini-2.5-flash` | Provider's directional signal |
| Encryption | PyNaCl box | 1.5 | End-to-end provider → buyer agent |
| Chain | Arc testnet (Canteen) | chain id 5042002 | All on-chain state |
| Auth (Arc) | arc-canteen CLI | latest | Authenticated RPC + faucet |
| Payments | x402 nanopayments | (scaffolded) | Per-signal USDC micropayments |

---

## 9. Outstanding work

| # | Item | Severity |
|---|------|----------|
| 1 | **Rotate the Gemini key** — it appeared in chat history | 🔴 Do today |
| 2 | Set `CIRCLE_API_KEY` (already set) + `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` to take the buyer agent out of sim mode | 🟡 Required for real execution |
| 3 | Generate the first end-to-end ZK proof: run `cd circuits && node scripts/prove.js --signals ../agents/signals.json --out proof.json`, then submit calldata to `SignalMarket.submitStatsProof` | 🟡 Real verifier is deployed but unused so far |
| 4 | **Poseidon ↔ keccak commitment root mismatch** — circuit chains via Poseidon, on-chain `CommitReveal.getCommitmentRoot` chains via keccak. The `submitStatsProof` root check will never pass with the current `track_record.circom`. Fix by switching either side to the other hash. | 🔴 Blocks real proof submission |
| 5 | Multi-party trusted setup (currently single dev contribution) | 🟡 Mainnet readiness |
| 6 | Move backend to Postgres + add proper auth on relay writes | 🟡 Production readiness |
| 7 | Proxy frontend RPC through backend (currently leaks `swrm_…` token in `NEXT_PUBLIC_ARC_RPC_URL` if you deploy the frontend publicly) | 🟡 Pre-public-launch |
| 8 | Transfer ownership of `ProviderRegistry` + `SignalMarket` from deployer EOA to a multisig | 🟡 Pre-mainnet |
| 9 | Real Arc USDC — currently using `MockUSDC`. Set `USDC_ADDRESS` and re-deploy `SignalMarket` with the real address | 🟢 Whenever Canteen publishes the canonical USDC |
| 10 | Backend signal-relay queue (NATS/Redis Streams) so a crash before the buyer polls can't drop signals | 🟢 Production polish |
| 11 | Pyth feed staleness check before treating a price as truth on reveal | 🟢 Production polish |
| 12 | TEE-based buyer agents (Phala / Marlin / Oasis Sapphire) — signals never exposed to host OS | 🟢 V2 feature |

---

## 10. How to bring the demo back up after a reboot

```bash
cd /Users/swarnimraj/zkRoute

# 1. Backend
python3 -m uvicorn backend.main:app --port 8000 > /tmp/zkroute_backend.log 2>&1 &

# 2. Agents (short timing for live demo)
SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
  python3 -m agents.provider.agent > /tmp/zkroute_provider.log 2>&1 &
python3 -m agents.buyer.agent > /tmp/zkroute_buyer.log 2>&1 &

# 3. Frontend
(cd frontend && npm run dev > /tmp/zkroute_frontend.log 2>&1 &)

# 4. Tail
tail -f /tmp/zkroute_{provider,buyer,backend,frontend}.log
```

Then open http://localhost:3000/buyer and connect MetaMask with the deployer key.

---

## 11. How to test things broke

```bash
cd contracts && npm test         # 30/30 — should all pass
cd ../backend && PYTHONPATH=.. pytest
cd ../agents  && PYTHONPATH=.. pytest
cd ../frontend && npm run build  # type-check + bundle
```

If you only changed a contract, recompile + redeploy + re-run smoke:

```bash
cd contracts && npm run compile
npx hardhat run scripts/smoke.js --network arc
```

---

## 12. Cost so far on Arc testnet

The deployer started with `73.7` native (gas) tokens at nonce 30. As of session end:

```
deployer balance: ~63 native (10 burnt across deploys + funding + 2 verifier deploys + setVerifier + init_demo + agent gas top-ups)
```

Each provider commit costs ~85k gas, each reveal ~50k. At 20 gwei base fee, full ETH+BTC cycle (commit/reveal both pairs) ≈ 270k gas ≈ 0.0054 native per cycle. The deployer wallet can fund ~10,000 more demo cycles before running out.
