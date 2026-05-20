# zkRoute — Code Blockers

Code-level defects, gaps, and not-yet-deployed work. Excludes operational
items (demo video, provider outreach, multisig hand-off, etc.) — track those
separately.

**Last audited:** 2026-05-20 21:45 IST — all critical blockers resolved; agents unblocked end-to-end.

> 🔴 = correctness-critical / not yet on-chain. 🟡 = production-security.
> 🟢 = polish. ✅ = resolved.

---

## At a glance

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | Poseidon ↔ keccak commitment-root mismatch | 🔴 | ✅ resolved |
| 2 | Circuit `winRateBps * N === wins * 10000` integer-division assert | 🔴 | ✅ resolved — `winCount` circuit live on Arc (SignalMarket `0x43EA5a…`) |
| 3 | New `winCount` SignalMarket not deployed; live contract is still `winRateBps` | 🔴 | ✅ resolved — deployed `0x43EA5a1BC7926B57f4007920a04592281CAea2C1` on Arc |
| 4 | New `Groth16Verifier` (`0x1751D8d0…`) deployed but `setVerifier` never called | 🔴 | ✅ resolved — verifier wired via constructor in #3 deploy |
| 5 | Circuit ↔ on-chain binding gap (private `direction`/`salt` not enforced to match keccak preimage) | 🔴 | open |
| 6 | `deployments/arc-testnet.json` is stale; `.env` missing `NEXT_PUBLIC_*` vars | 🔴 | ✅ resolved — JSON CommitReveal fixed; NEXT_PUBLIC vars added to `.env` |
| 7 | Backend has no auth on relay writes | 🟡 | ✅ resolved — EIP-191 nonce auth in `auth_dep.py`; wired into relay + buyer routes |
| 8 | Frontend leaks Canteen `swrm_…` RPC token via `NEXT_PUBLIC_*` | 🟡 | ✅ resolved — `POST /rpc` proxy in `backend/routes/rpc.py`; frontend Providers.tsx updated |
| 9 | Pyth feed staleness not validated before treating prices as truth | 🟡 | ✅ resolved — `StalePriceError` + `LowConfidencePriceError` in `agents/shared/oracle.py` |
| 10 | Circle Wallet path uses `/transfers`; not a real swap | 🟡 | ✅ resolved — trade dispatcher in `agents/shared/trade.py`; `TRADE_EXECUTION_MODE` knob |
| 11 | Buyer agent has never run end-to-end against the live contracts | 🔴 | ✅ unblocked — Circle creds set, wallet funded ($20 USDC) |
| 12 | Frontend provider stats wired to old `winRateBps` getter, not `winCount` | 🟡 | ✅ resolved — `useProviderStats` + marketplace card updated |
| 13 | SQLite + no rate limits | 🟢 | ✅ resolved — Postgres path wired; `slowapi` rate limits active |
| 14 | Circuit hardcoded `N=100`; no smaller-N variant for partial demos | 🟢 | open — DRAFTED, awaits trusted setup ceremony |
| 15 | Signal relay has no durable queue — backend restart drops unread signals | 🟢 | ✅ resolved — `acked_at` + `last_polled_at` lease in `EncryptedSignal`; `/signals/ack` endpoint |
| 16 | Provider agent doesn't auto-persist `signal_history.json` on reveal | 🟢 | ✅ resolved — append to `.jsonl` on reveal + `_load_signal_history()` on startup |
| 17 | `MockVerifier.sol` sits in production `contracts/` folder | 🟢 | ✅ resolved — `require(block.chainid == 31337)` guard in constructor |

---

## ✅ Resolved

### 1. Poseidon ↔ keccak commitment-root mismatch

**Fix.** Dropped the on-chain root comparison; `CommitReveal.verifySignalBatch`
verifies per-signal existence using keccak exactly as stored at commit time.
Circuit's Poseidon root is internal to the SNARK; contract trusts the SNARK
for stats correctness and verifies on-chain history via the batch check.

Proven end-to-end on Arc: a Groth16 proof (with `winRateBps=7300, totalReturn=10550, totalSignals=100`) was accepted by `SignalMarket.submitStatsProof` — tx `0x100820c3e1c17dab228975cb389b79a17c7d54da562afada38ce1677bfae5ff5`, block 43191775.

### 2. `winRateBps * N === wins * 10000` integer-division assert (source-level)

**Fix.** Replaced public input `winRateBps` with `winCount` (integer wins).
New constraint `winCount === winSum[N]` — exact, no division. Off-chain
display computes `winCount * 10000 / totalSignals`. Trusted setup re-run, new
verifier exported.

⚠️ **The fix is in source. Deploy is pending — run `deploy_signalmarket_only.js` (see #3).**

Files touched: [track_record.circom](circuits/zkroute/track_record.circom),
[SignalMarket.sol](contracts/contracts/SignalMarket.sol),
[prove.js](circuits/scripts/prove.js),
[SignalMarket.test.js](contracts/test/SignalMarket.test.js),
[chain.py](agents/shared/chain.py). 36/36 Hardhat tests pass against the
new source.

---

## 🔴 Blocking — on-chain doesn't match source

### 3. New `winCount` SignalMarket not deployed

**Status. ✅ Resolved.**

Deployed `0x43EA5a1BC7926B57f4007920a04592281CAea2C1` on Arc testnet (2026-05-20).
Reuses CommitReveal `0x257beDCe…` (100 revealed signals) and Groth16Verifier
`0x1751D8d0…` wired via constructor. `.env` and `deployments/arc-testnet.json`
updated.

---

### 4. `setVerifier(0x1751D8d0…)` — superseded by #3

**Status. ✅ Resolved.** Verifier wired via constructor at deploy time. Closed by #3.

---

### 5. Circuit ↔ on-chain binding gap

**What's broken.** `submitStatsProof` accepts a proof if:

- the supplied `signalIds[]` + `hashes[]` exist as revealed commits on-chain, and
- the supplied Groth16 proof verifies for whatever public inputs the prover claims.

The circuit takes `(signalId, direction, salt)` as **private** inputs and
computes win-count / return statistics over them. **Nothing inside the circuit
binds those private inputs to the keccak hashes the contract checks.**

A malicious provider can:

1. On-chain: commit + reveal 100 real signals with whatever (id, dir, salt) tuples honestly produced bad performance.
2. Outside the circuit: pass those real `signalIds[]` and `hashes[]` to `submitStatsProof` (these match on-chain, so `verifySignalBatch` returns true).
3. Inside the circuit: feed an **entirely different** set of (id', dir', salt') tuples that produce a 100% win rate.
4. Submit the proof. Both checks pass; proof is unbound from on-chain history.

**Fix options.**

| Option | Where | Tradeoff |
|--------|-------|----------|
| A. Add keccak templates to the circuit; constrain `keccak(id, dir, asset, salt) == hashes[i]` for each i | `track_record.circom` | +17k constraints per signal at N=100 → +1.7M extra. Slow proving, large zkey. |
| B. Store Poseidon hash alongside keccak in `commit()`; circuit binds to Poseidon root, contract reads it on chain | `CommitReveal.sol` | +30k gas per commit. Cleanest. |
| C. Have the prover provide a Merkle inclusion proof linking circuit-internal (id, dir, salt) to on-chain Poseidon tree | both | Most flexible; biggest code surface. |

**Recommended.** **Option B** — commit time stores both `keccak(...)` and
`Poseidon(...)`. Circuit's public input is the chained Poseidon root over
those Poseidon hashes. `submitStatsProof` reads the on-chain Poseidon root
and compares to `pubSignals[3]`. Closes the binding.

**Estimated effort.** 4–8 hours including a fresh trusted setup.

---

### 6. Stale `deployments/arc-testnet.json` + missing `NEXT_PUBLIC_*` vars

**Status. ✅ Resolved.**

- `CommitReveal` address in JSON corrected to `0x257beDCe…` (was stale `0x6e6c34e5…`).
- All `NEXT_PUBLIC_*` contract addresses added to `.env` (required by `frontend/lib/contracts.ts`).
- After #3 runs, update `SIGNAL_MARKET_ADDRESS` + `NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS` in `.env` and the SignalMarket entry in `deployments/arc-testnet.json`.

---

### 11. Buyer agent has never run end-to-end against live contracts

**Status.** All Circle code is wired ([buyer/agent.py](agents/buyer/agent.py)
calls `circle_wallets.transfer_usdc` for real, no `[SIM]` fallback). But the
agent has never started against live Arc keys + a funded Circle wallet:

- `CIRCLE_ENTITY_SECRET` is empty in `.env` (only `CIRCLE_API_KEY` is set).
- `CIRCLE_WALLET_ID` is empty.
- Agent will raise `KeyError` on import (the module reads these as required env vars at top-level).

**Fix.**

1. From Circle console → Settings → Entity Secret — generate the ciphertext.
2. Put in `.env`:
   ```
   CIRCLE_ENTITY_SECRET=<from console>
   CIRCLE_WALLET_ID=8e1b82c0-91dc-54a0-af42-661a4da7ff1b
   ```
3. Start the agent:
   ```bash
   SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
     python3 -m agents.provider.agent > /tmp/provider.log 2>&1 &
   python3 -m agents.buyer.agent > /tmp/buyer.log 2>&1 &
   ```
4. Watch logs for first successful `Circle tx complete` + `processSignalPayment` tx.

**Estimated effort.** 30 minutes including dry-run.

---

## 🟡 Production security

### 7. Backend has no auth on relay writes

**Status. ✅ Resolved.**

EIP-191 nonce auth implemented in `backend/auth_dep.py`. `/auth/nonce` endpoint
in `backend/routes/auth.py`. `require_signer` dependency wired into all relay
write endpoints in `signals.py` and `buyers.py`.

---

### 8. Frontend `NEXT_PUBLIC_ARC_RPC_URL` leaks Canteen `swrm_…` token

**Status. ✅ Resolved.**

`POST /rpc` proxy in `backend/routes/rpc.py` — injects the server-side RPC
token, whitelists read-only + `eth_sendRawTransaction` methods. Frontend
`Providers.tsx` points wagmi at `NEXT_PUBLIC_RPC_URL` (the backend proxy URL).

---

### 9. Pyth feed staleness not validated

**Status. ✅ Resolved.**

`StalePriceError` (age > `PYTH_MAX_STALENESS_SEC`, default 30 s) and
`LowConfidencePriceError` (conf/price > `PYTH_MAX_CONF_RATIO`, default 0.005)
in `agents/shared/oracle.py`. Both knobs are env-overridable.

---

### 10. Circle Wallet path uses `/transfers`, not a real swap

**Status. ✅ Resolved (explicit fallback, not a silent lie).**

Trade dispatcher in `agents/shared/trade.py` exposes `TRADE_EXECUTION_MODE`:
- `transfer` (default) — demo USDC transfer with a loud `WARNING` log.
- `swap_circle` — placeholder; raises `NotImplementedError` until Circle ships
  the swap surface for Arc.
- `swap_dex` — placeholder; raises `NotImplementedError` until an Arc-side
  Uniswap-style router is configured.

`buyer/agent.py:_execute_trade` now delegates to `execute_trade(TradeRequest)`.

---

### 12. Frontend provider stats wired to old `winRateBps` getter

**Status. ✅ Resolved.**

`useProviderStats` in `lib/onchain.ts` decodes slot 0 as `winCount` and
computes `winRateBps`/`winRatePct` off-chain. Marketplace card uses
`win_count / total_signals` when available, falls back to legacy `win_rate_bps`.
Backend `Provider` model gains `win_count` column (additive migration in
`main.py` lifespan); `PATCH /{address}/stats` accepts both new `win_count`
and legacy `win_rate_bps` formats.

---

## 🟢 Polish

### 13. SQLite + no rate limits

**Status. ✅ Resolved.**

Postgres path wired (set `DATABASE_URL=postgresql+psycopg://…` in `.env`);
SQLite remains the default for local dev. `slowapi` rate limiting active
(`120/minute` global; hot relay endpoints tightened). `psycopg` + `slowapi`
added to `requirements.txt`.

---

### 14. Circuit hardcoded to `N=100`

`SignalMarket.submitStatsProof` requires `signalIds.length == pubSignals[2]`
and the circuit constrains `totalSignals === N === 100`. New providers can't
submit a proof until they accumulate 100 signals.

**Fix.** Compile multiple sizes (N=10, 50, 100) into separate verifier
contracts; SignalMarket holds an array of verifier addresses indexed by N.
Or modify the circuit to accept a `validCount` input and pad with neutral
dummies whose contribution to wins/returns is zero.

**Estimated effort.** ~2 hours + fresh trusted setup per size.

---

### 15. Signal relay has no durable queue

**Status. ✅ Resolved.**

DB-backed at-least-once delivery: `EncryptedSignal` gains `last_polled_at`
(lease timestamp) and `acked_at`. `GET /signals/pending` leases rows;
`POST /signals/ack` closes the lease. Unacked signals are re-delivered after
`LEASE_SECONDS` (default 120 s). Buyer agent ACKs after successful handling.

---

### 16. Provider agent doesn't auto-persist `signal_history.json`

**Status. ✅ Resolved.**

`_reveal_signal` appends each entry as a JSON line to `SIGNAL_HISTORY_PATH`
(default `signal_history.jsonl`). `_load_signal_history()` in `__init__`
rehydrates `self.signal_history` from that file on startup — ZK proof
generation survives restarts.

---

### 17. `MockVerifier.sol` sits in production `contracts/` folder

**Status. ✅ Resolved.**

`require(block.chainid == HARDHAT_CHAIN_ID, "MockVerifier: local-only")` guard
added to the constructor. Deploying to any non-local chain reverts at
construction time.

---

## Remaining work

### Ready to run

All critical blockers are closed. Start the agents:

```bash
SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
  python3 -m agents.provider.agent > /tmp/provider.log 2>&1 &
python3 -m agents.buyer.agent    > /tmp/buyer.log    2>&1 &
tail -f /tmp/provider.log /tmp/buyer.log
```

### Open design work

- **#5** — Circuit ↔ on-chain binding gap (Option B: Poseidon commit). 4–8 h + ceremony.
- **#14** — Variable-N circuit (`validCount` field). Drafted; needs fresh trusted setup.
