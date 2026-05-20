# zkRoute — Session Updates

A running log of what was built, fixed, and deployed across all sessions.
Last refresh: **2026-05-20**.

---

## TL;DR (latest session — 2026-05-20)

**ZK pipeline unblocked end-to-end:**
- ✅ **`winRateBps` → `winCount`**: root cause of circuit assert failure fixed. Integer division `(2*10000)/3 = 6666` but `6666*3 ≠ 20000` — switched public signal to exact integer win count. Circuit, contract, prove.js, tests all updated.
- ✅ **New `Groth16Verifier` deployed** (`0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229`) — third verifier, matches the `winCount` circuit. `setVerifier` called on SignalMarket.
- ✅ **Full trusted setup re-run**: circuit recompiled, new zkey generated, `verification_key.json` + `Verifier.sol` exported.
- ✅ **Proof generation tested end-to-end**: 3 signals → `winCount=2, totalReturnBps=260bps` — local verification passes.

**Runtime stack fixed:**
- ✅ **Python deps**: `pynacl`, `web3`, `google-genai`, `httpx` etc. installed into correct Python 3.12 (not conda 3.13)
- ✅ **`ExtraDataToPOAMiddleware` compat shim**: web3 v6 uses `geth_poa_middleware` — try/except shim added to `chain.py`
- ✅ **Live connections verified**: Arc RPC ✓, provider wallet 4.85 ETH ✓, Pyth oracle ETH $2111 / BTC $76709 ✓, all 3 contracts have bytecode on-chain ✓

**prove.js fixed:**
- ✅ **ethers v5 API**: switched from v6 (`ethers.keccak256`) to v5 (`ethers.utils.keccak256`, `ethers.utils.toUtf8Bytes`)
- ✅ **`assetId` computed correctly**: was referencing `s.assetId` (undefined) — now derives `keccak256(toUtf8Bytes(s.asset))`
- ✅ **Provider agent** now includes `"asset"` field in signal history so prove.js can compute the on-chain hash

**Project hygiene:**
- ✅ **bun set as package manager** for all JS/TS going forward (not npm/yarn)
- ✅ **36/36 contract tests passing** (up from 30) — updated for `winCount`, `verifySignalBatch`, new error messages
- ✅ **`ZK_VERIFIER_ADDRESS` updated in `.env`** to current verifier

---

## Previous session TL;DR (2026-05-19)

- ✅ All 5 contracts deployed and verified on Arc testnet
- ✅ Real Groth16 trusted setup completed (first run), real verifier deployed
- ✅ Full agent-to-agent pipeline wired: Gemini → commit → encrypt → relay → decrypt → risk-validate → execute → report
- ✅ Circle Programmable Wallets fully wired (buyer agent); all SIM/mock code removed
- ✅ `verifySignalBatch` added to CommitReveal — fixes Poseidon↔keccak root mismatch without EVM Poseidon
- ✅ Landing page redesign: GSAP canvas ASCII orb, film grain, zkRoute wordmark
- ✅ 30/30 Hardhat tests passing
- ✅ Production contract hardening (reentrancy, pause, fee accounting, agent auth)

---

## 1. Live Arc testnet deployment

**Network**

| Field | Value |
|-------|-------|
| Name | Arc Testnet (Canteen) |
| Chain ID | `5042002` (`0x4cef52`) |
| RPC | configured in `.env` (auth token) |
| Deployer | `0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859` |

**Contracts (current)**

| Contract | Address | Notes |
|----------|---------|-------|
| MockUSDC | `0x999f73DeA290960Afbd2f6e582F48bEfdFfDB6Ed` | [MockERC20.sol](contracts/contracts/MockERC20.sol) |
| ProviderRegistry | `0x932Cb43D99e1CFB5D275Be0c87FA3313f76a6aeE` | [ProviderRegistry.sol](contracts/contracts/ProviderRegistry.sol) |
| CommitReveal | `0x6e6c34e5781D45C5b0c91ecf258EAfaccc52fCDe` | [CommitReveal.sol](contracts/contracts/CommitReveal.sol) |
| **Groth16Verifier (winCount circuit)** | **`0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229`** | Deployed 2026-05-20; swapped in via `setVerifier` |
| SignalMarket | `0x02c40758eB9932257F056fbB60714ccbdA8C4bd4` | [SignalMarket.sol](contracts/contracts/SignalMarket.sol) |

> Previous verifier `0x403Fe040…` (first setup run, `winRateBps` circuit) is now superseded. `0xa86a5851…` was an intermediate deploy, also superseded.

---

## 2. ZK pipeline — full history & current state

### The bug (now fixed)

The circuit constrained `winRateBps * totalSignals === winSum[N] * 10000`. Because Circom uses integer arithmetic, `(2 wins / 3 signals) * 10000 = 6666` but `6666 * 3 = 19998 ≠ 20000`. The witness generator threw an assert, making it impossible to generate any proof with a non-round win rate.

**Fix**: public signal `winRateBps` → `winCount` (raw integer win count). The constraint becomes `winCount === winSum[N]` — exact, no division. Win rate bps is computed off-chain: `winCount * 10000 / totalSignals`.

This also simplified the `SignalMarket` validation: instead of `pubSignals[0] <= BPS_DENOM`, it now checks `pubSignals[0] <= pubSignals[2]` (winCount ≤ totalSignals).

### Trusted setup history

| Step | 2026-05-19 | 2026-05-20 |
|------|-----------|-----------|
| Circuit | `winRateBps` (broken constraint) | `winCount` (fixed) |
| ptau | Downloaded from GCS mirror (288 MB) | Reused |
| zkey | `track_record_final.zkey` (v1) | Regenerated (v2) |
| Verifier deployed | `0x403Fe040…` | `0x1751D8d0…` |
| End-to-end proof test | ❌ assert failed | ✅ passes |

### Proof output (verified working)

```
Generating witness...
Proof written to /tmp/test_proof.json
Wins: 2/3 (6666bps)
Total return: 260bps
```

Public signals: `[winCount=2, totalReturnBps=260, totalSignals=3, commitmentRoot=217829...]`

---

## 3. Agent pipeline — current status

| Component | Status | Blocker |
|-----------|--------|---------|
| Provider agent — Gemini signal gen | ✅ wired | — |
| Provider agent — commit on-chain | ✅ wired | — |
| Provider agent — encrypt + relay | ✅ wired | — |
| Provider agent — reveal + ZK proof | ✅ wired | needs signals to accumulate |
| Buyer agent — decrypt | ✅ wired | — |
| Buyer agent — risk validation | ✅ wired | — |
| Buyer agent — Circle trade execution | ⏳ wired, not tested | `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` empty in `.env` |
| Buyer agent — nanopayment on-chain | ✅ wired | depends on Circle |
| Agents actually running | ❌ not started | Circle creds needed |

**Circle wallet inventory** (read from API with existing key):

| Wallet ID | Address | USDC Balance |
|-----------|---------|-------------|
| `fdd85505` | `0x2c379667…` | $1,771 |
| `8e1b82c0` | `0x921e13dd…` | $2,637 ← recommended |
| `7690027a` | `0xc165b07f…` | $2,323 |

Set `CIRCLE_WALLET_ID=8e1b82c0-91dc-54a0-af42-661a4da7ff1b` and fill `CIRCLE_ENTITY_SECRET` from the Circle console.

---

## 4. Bugs found & fixed (all sessions)

| # | Bug | Fix |
|---|-----|-----|
| 1 | `winRateBps * totalSignals === winSum[N] * 10000` fails with non-round win rates | Replaced with `winCount === winSum[N]` |
| 2 | `prove.js` used ethers v6 API (`toUtf8Bytes`, `solidityPackedKeccak256`) but ethers v5 is installed in circuits/ | Switched to `ethers.utils.*` |
| 3 | `prove.js` used `s.assetId` (undefined) — signals only have `s.asset` string | Compute `assetId = keccak256(toUtf8Bytes(asset))` inline |
| 4 | Provider agent signal history missing `asset` field — prove.js needs it to compute on-chain hash | Added `"asset": sig.asset` to history append |
| 5 | `ExtraDataToPOAMiddleware` import fails on web3 v6 | Try/except compat shim: falls back to `geth_poa_middleware` |
| 6 | `pip install` installed pynacl into conda Python 3.13 but `python3` resolves to system 3.12 | Re-ran install with `/Library/Frameworks/Python.framework/Versions/3.12/bin/pip3` |
| 7 | `circomlibjs` missing from circuits/node_modules | `bun add circomlibjs` |
| 8 | Poseidon↔keccak commitment root mismatch blocked all proof submission | Replaced root comparison with `verifySignalBatch` (per-signal keccak check) |
| 9 | `processSignalPayment` required `msg.sender == buyer` — agent has its own key | Added `agent` field to Subscription + `onlyAgentOrBuyer` modifier |
| 10 | `withdrawFees` could sweep buyer floats and provider revenue | Split into `treasuryBalance`, `providerRevenue[]`, `subscriptions[].float` |
| 11 | Slashed bond and active stakes in same balance | Added `slashedBalance` separate from active stakes |
| 12 | Provider could keep commitment open indefinitely | Added `MAX_REVEAL_WINDOW_BLOCKS = 50_000` |
| 13 | Hermez S3 ptau mirror returns 403 | Switched to GCS mirror `storage.googleapis.com/zkevm/ptau/` |
| 14 | Provider agent crashed: `Unknown kwargs: ['gasPrice']` | Dropped legacy `gasPrice`; use EIP-1559 fields only |
| 15 | `build_transaction` doesn't auto-fill nonce | Re-added explicit `nonce = w3.eth.get_transaction_count(...)` |
| 16 | Buyer agent polled signals against agent address instead of buyer address | Added `BUYER_ADDRESS` env var; separated signing identity from principal |
| 17 | Vercel deploy: "No Output Directory named 'public' found" | Created `frontend/vercel.json` with `{"framework": "nextjs"}` |
| 18 | ESLint v9 incompatibility with Next.js 14 | Pinned `eslint@8` + `eslint-config-next@14.2.3` |
| 19 | Canvas orb filled `#000` each frame causing black void below | Switched to `clearRect` so canvas is transparent |

---

## 5. Tests

| Suite | Tool | Count | Status |
|-------|------|-------|--------|
| Contracts ([contracts/test/](contracts/test/)) | Hardhat + chai | **36** | ✅ All pass |
| Backend ([backend/tests/](backend/tests/)) | pytest | 18 | Run: `cd backend && pytest` |
| Agents ([agents/tests/](agents/tests/)) | pytest | 12 | Run: `cd agents && PYTHONPATH=.. pytest` |

Contract test coverage (36 tests):
- CommitReveal: commit/reveal/double-commit/hash-mismatch/window-expiry/verifySignalBatch (true/false/wrong-hash/unknown)
- ProviderRegistry: register/re-register/slash/deactivate/pause/treasury-withdraw
- SignalMarket: subscribe/bounds/agent-auth/payment-split/fee-accounting/claimRevenue/pause/submitStatsProof (winCount valid, unrevealed, count-mismatch, rate-limit, winCount>totalSignals)

---

## 6. Outstanding work

| # | Item | Priority |
|---|------|----------|
| 1 | Fill `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID=8e1b82c0…` in `.env` | 🔴 Blocks real trades |
| 2 | Start provider + buyer agents, run a full signal cycle end-to-end | 🔴 Demo blocker |
| 3 | Wire frontend provider stats to `getProviderStats()` — show `winCount/totalSignals` live | 🟡 Demo quality |
| 4 | Record 3-min demo video showing: commit tx → buyer USDC moves → reveal tx → ZK proof on-chain | 🟡 Hackathon submission |
| 5 | Show adversarial case in demo: provider tries to reveal wrong direction → tx reverts | 🟡 Makes trust model concrete |
| 6 | Multi-party trusted setup (currently single dev contribution) | 🟢 Mainnet readiness |
| 7 | Move backend to Postgres + auth on relay writes | 🟢 Production polish |
| 8 | Proxy Arc RPC through backend (currently token leaks in `NEXT_PUBLIC_ARC_RPC_URL`) | 🟢 Pre-public launch |

---

## 7. How to bring the demo up

```bash
cd /Users/adityamane/zkRoute

# 1. Backend
python3 -m uvicorn backend.main:app --port 8000 > /tmp/zkroute_backend.log 2>&1 &

# 2. Agents (short timing for demo)
SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
  python3 -m agents.provider.agent > /tmp/zkroute_provider.log 2>&1 &
python3 -m agents.buyer.agent > /tmp/zkroute_buyer.log 2>&1 &

# 3. Frontend
(cd frontend && bun run dev > /tmp/zkroute_frontend.log 2>&1 &)

# 4. Tail logs
tail -f /tmp/zkroute_{provider,buyer,backend}.log
```

**Connection check (run first):**
```bash
python3 -c "
from dotenv import load_dotenv; load_dotenv()
from agents.shared.chain import get_web3, get_account
import os, asyncio
from agents.shared import oracle
w3 = get_web3()
print('Connected:', w3.is_connected())
acc = get_account(os.environ['PROVIDER_AGENT_PRIVATE_KEY'])
print('Provider:', acc.address, w3.from_wei(w3.eth.get_balance(acc.address), 'ether'), 'ETH')
asyncio.run(oracle.get_price('ETH'))
"
```

---

## 8. Run tests

```bash
# Contracts (36 tests)
cd contracts && npx hardhat test

# Backend
cd backend && pytest

# Agents
cd agents && PYTHONPATH=.. pytest

# Frontend type-check + build
cd frontend && bun run build
```

---

## 9. Cost on Arc testnet

Provider wallet started with ~73 native tokens. Current balance: **4.857 ETH** (gas spent across deploys, verifier swaps, init_demo, 3× verifier deploys during ZK iteration).

Each full signal cycle (commit ETH + commit BTC + reveal both): ~270k gas ≈ 0.005 native. Enough for thousands more demo cycles.
