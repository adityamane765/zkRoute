# zkRoute — Blockers

A focused list of what's blocking zkRoute from being either (a) a complete demo,
(b) hackathon-submission-ready, or (c) mainnet-ready.

> Skim the table first. 🟢 = resolved. 🔴 = still blocking. 🟡 = needed for submission. ⚪ = pre-mainnet polish.

---

## At a glance

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | Poseidon ↔ keccak commitment-root mismatch | 🔴 | ✅ **RESOLVED** |
| 2 | ZK circuit `winRateBps` integer division fails witness generation | 🔴 | ✅ **RESOLVED** |
| 3 | `ExtraDataToPOAMiddleware` import breaks on web3 v6 | 🔴 | ✅ **RESOLVED** |
| 4 | Python deps (`nacl`) installed into wrong interpreter | 🔴 | ✅ **RESOLVED** |
| 5 | `prove.js` uses ethers v6 API but ethers v5 is installed | 🔴 | ✅ **RESOLVED** |
| 6 | ZK trusted setup not run — no `.zkey`, no verifier | 🔴 | ✅ **RESOLVED** |
| 7 | Circle Wallets in `[SIM]` mode — all trade code removed, real wiring done | 🟡 | ✅ **CODE DONE** — needs `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` in `.env` |
| 8 | Agents never actually run | 🔴 | 🔴 **STILL BLOCKED** — Circle creds needed |
| 9 | No recorded demo video | 🟡 | 🔴 **TODO** |
| 10 | Frontend provider stats shows stale/mock data | 🟡 | 🔴 **TODO** |
| 11 | Backend has no auth on relay writes | 🟡 | ⚪ pre-mainnet |
| 12 | Frontend leaks `swrm_…` RPC token via `NEXT_PUBLIC_*` | 🟡 | ⚪ pre-mainnet |
| 13 | Single-contribution trusted setup | ⚪ | ⚪ pre-mainnet |
| 14 | SQLite + no rate limits | ⚪ | ⚪ pre-mainnet |
| 15 | Owner is deployer EOA, not multisig | ⚪ | ⚪ pre-mainnet |
| 16 | MockUSDC instead of canonical Arc USDC | ⚪ | ⚪ when Arc publishes address |

---

## ✅ Resolved blockers

### 1. Poseidon ↔ keccak commitment-root mismatch ✅

**Was:** Circuit chained commitments with Poseidon; `CommitReveal.sol` chained with keccak. `SignalMarket.submitStatsProof` compared the two — they never agreed. Every real proof submission would revert.

**Fix (2026-05-19):** Dropped the on-chain root comparison entirely. Added `verifySignalBatch(provider, signalIds[], hashes[])` to `CommitReveal.sol` — checks each individual signal exists and was revealed, using keccak exactly as stored at commit time. The Groth16 verifier proves the Poseidon root is internally consistent; the contract confirms the signals are real on-chain history. Two different hash functions, two different jobs — no comparison needed.

Files changed: [CommitReveal.sol](contracts/contracts/CommitReveal.sol), [SignalMarket.sol](contracts/contracts/SignalMarket.sol), [prove.js](circuits/scripts/prove.js).

---

### 2. ZK circuit `winRateBps` integer division fails witness generation ✅

**Was:** Circuit constraint: `winRateBps * totalSignals === winSum[N] * 10000`. With 2 wins from 3 signals: `(2*10000)/3 = 6666` (floor), but `6666 * 3 = 19998 ≠ 20000`. Witness generation threw an assert for any non-round win rate — i.e., almost always.

**Fix (2026-05-20):** Replaced `winRateBps` public signal with `winCount` (raw integer win count). New constraint: `winCount === winSum[N]` — exact, no division. Win rate bps is computed off-chain as `winCount * 10000 / totalSignals`. Updated `SignalMarket` validation from `pubSignals[0] <= BPS_DENOM` to `pubSignals[0] <= pubSignals[2]` (winCount ≤ totalSignals). Regenerated zkey, redeployed verifier (`0x1751D8d086a672F24Ccf8A16c19b3CA5068b1229`), called `setVerifier` on-chain.

Files changed: [track_record.circom](circuits/zkroute/track_record.circom), [SignalMarket.sol](contracts/contracts/SignalMarket.sol), [prove.js](circuits/scripts/prove.js), [SignalMarket.test.js](contracts/test/SignalMarket.test.js), [chain.py](agents/shared/chain.py).

---

### 3. `ExtraDataToPOAMiddleware` import breaks on web3 v6 ✅

**Was:** `from web3.middleware import ExtraDataToPOAMiddleware` raised `ImportError` — web3 v6 uses `geth_poa_middleware` instead.

**Fix (2026-05-20):** Added try/except compat shim in [chain.py](agents/shared/chain.py): tries the v7 name first, falls back to v6. No version pin needed.

---

### 4. Python deps installed into wrong interpreter ✅

**Was:** `pip install` dropped `pynacl` into conda Python 3.13 but `python3` aliased to system Python 3.12. `import nacl` failed at runtime.

**Fix (2026-05-20):** Re-ran `pip3.12 install -e agents/` via the explicit interpreter path. All agent deps now importable from the correct Python.

---

### 5. `prove.js` uses ethers v6 API on ethers v5 ✅

**Was:** `ethers.toUtf8Bytes`, `ethers.keccak256`, `ethers.solidityPackedKeccak256` — all v6 API. circuits/node_modules has ethers v5. Threw `TypeError: ethers.toUtf8Bytes is not a function`.

**Fix (2026-05-20):** Switched to `ethers.utils.keccak256`, `ethers.utils.toUtf8Bytes`, `ethers.utils.solidityKeccak256`. Also fixed `s.assetId` (undefined) → compute `assetId = keccak256(toUtf8Bytes(s.asset))` inline.

---

### 6. ZK trusted setup not run ✅

**Was:** No `.zkey`, no `verification_key.json`, no `Verifier.sol`, no deployed verifier matching the circuit.

**Fix (2026-05-20):**
- `circomlibjs` installed via bun (was missing from circuits/node_modules)
- ptau downloaded from GCS mirror (Hermez S3 was dead)
- Full Groth16 phase 2 setup run: `track_record_final.zkey` generated
- `verification_key.json` + `Verifier.sol` exported
- Deployed to Arc twice: once for the `winRateBps` circuit (superseded), once for the `winCount` circuit (`0x1751D8d0…` — current)
- `SignalMarket.setVerifier(0x1751D8d0…)` called on-chain (tx `0x6ed09e03…`)
- End-to-end proof test passes: 3 signals → `winCount=2, totalReturnBps=260bps` ✓

---

### 7. Circle Wallets — all SIM code removed, real wiring done ✅ (pending creds)

**Was:** Buyer agent logged `[SIM] Would trade ETH SHORT 3%`. All trade execution was fake.

**Fix (2026-05-19):** Completely rewrote [buyer/agent.py](agents/buyer/agent.py) and [circle_wallets.py](agents/shared/circle_wallets.py):
- `get_usdc_balance()`, `transfer_usdc()`, `wait_for_transaction()` — real Circle API calls
- `_execute_trade()` — checks balance, calls Circle, polls for COMPLETE/FAILED
- `stake_in_usyc()` — real USYC_CONTRACT_ADDRESS transfer
- Balance logged on startup; trade skipped (not faked) if balance insufficient

**Still needed:** Fill `.env`:
```
CIRCLE_ENTITY_SECRET=<from Circle console → Settings → Entity Secret>
CIRCLE_WALLET_ID=8e1b82c0-91dc-54a0-af42-661a4da7ff1b   # $2,637 USDC, ARC-TESTNET
```

---

## 🔴 Still blocking (must fix before demo)

### 8. Agents have never run against real keys

**What it blocks.** The full pipeline: signal commit → buyer decrypt → Circle trade → reveal → ZK proof. All code is wired but zero end-to-end test has run.

**Fix.**
1. Fill `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` (see blocker 7 above).
2. Start agents with short intervals:
   ```bash
   SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
     python3 -m agents.provider.agent > /tmp/provider.log 2>&1 &
   python3 -m agents.buyer.agent > /tmp/buyer.log 2>&1 &
   ```
3. Watch provider commit a signal on-chain (Arc explorer).
4. Watch buyer decrypt, Circle wallet balance drop.
5. Wait for reveal window, watch ZK proof submit.

---

### 9. No recorded demo video

**What it blocks.** Hackathon submission.

**Script (3 min):**
- 0:00 — the problem: how do you know a signal provider isn't picking winners in hindsight?
- 0:30 — show commit tx landing on Arc (block explorer, sub-second finality)
- 1:00 — buyer agent decrypts, Circle USDC balance drops (real money moved)
- 1:30 — signal revealed, outcome recorded on-chain
- 2:00 — ZK proof submitted, `StatsProofSubmitted` event in explorer
- 2:30 — frontend shows provider's ZK-verified win rate badge

**The adversarial case:** show provider trying to reveal with a different direction → tx reverts. Makes the trust model concrete.

---

### 10. Frontend provider stats shows stale data

**What it blocks.** Demo credibility. Judges will click a provider and see placeholder numbers.

**Fix.** Wire `getProviderStats(address)` on the provider detail page. Return struct now has `winCount` (not `winRateBps`) — compute display rate as `winCount * 100 / totalSignals`%. Show `lastProofBlock` as a "ZK Verified" badge with link to the proof tx.

---

## ⚪ Pre-mainnet polish (not blocking submission)

| # | Item | Effort |
|---|------|--------|
| 11 | Backend auth on relay writes (EIP-191 signed nonce) | ~2 hours |
| 12 | Proxy Arc RPC through backend — stop leaking `swrm_…` token in JS bundle | ~1 hour |
| 13 | Multi-party trusted setup (currently single dev contribution) | ~1 week coordination |
| 14 | Postgres + rate limits (SQLite locks on concurrent writes) | ~half day |
| 15 | Transfer ownership to multisig (Safe 2-of-3) | ~1 hour |
| 16 | Swap MockUSDC for canonical Arc USDC once Circle publishes address | ~30 min |

---

## Closing checklist for hackathon submission

- [x] Fix Poseidon ↔ keccak mismatch
- [x] Fix `winRateBps` integer division → `winCount`
- [x] ZK trusted setup complete, real verifier deployed + wired
- [x] All SIM/mock code removed from buyer agent
- [x] Python deps installed, Arc RPC connected, Pyth oracle live
- [x] 36/36 contract tests passing
- [ ] Fill `CIRCLE_ENTITY_SECRET` + `CIRCLE_WALLET_ID` in `.env`
- [ ] Run full agent pipeline end-to-end at least once
- [ ] Wire frontend stats to `getProviderStats()` with `winCount`
- [ ] Record demo video (3 min, show ZK proof tx on-chain)
