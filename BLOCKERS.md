# zkRoute — Blockers

A focused list of what's blocking zkRoute from being either (a) a complete demo,
(b) hackathon-submission-ready, or (c) mainnet-ready. Each blocker has a clear
"how to fix" with concrete steps so the next person picks it up immediately.

> Skim the table first. The 🔴 items are gating; 🟡 are needed for a credible
> submission; 🟢 are pre-mainnet polish.

---

## At a glance

| # | Blocker | Severity | Gates | Effort |
|---|---------|----------|-------|--------|
| 1 | Poseidon ↔ keccak commitment-root mismatch | 🔴 | Real ZK proof submission | ~1–4 hours |
| 2 | Circle Wallets in `[SIM]` mode | 🟡 | Real trade execution | ~30 min once creds in hand |
| 3 | Zero real providers / buyers | 🟡 | Traction (30% of judging) | Days, depends on outreach |
| 4 | No recorded demo video | 🟡 | Hackathon submission | 1–2 hours |
| 5 | Backend has no auth on relay writes | 🟡 | Production security | ~2 hours |
| 6 | Frontend leaks `swrm_…` RPC token via `NEXT_PUBLIC_*` | 🟡 | Public frontend deploy | ~1 hour (proxy via backend) |
| 7 | Single-contribution trusted setup | 🟢 | Mainnet readiness | Days (multi-party ceremony) |
| 8 | SQLite + no rate limits | 🟢 | Scale | ~half day |
| 9 | Owner is deployer EOA, not multisig | 🟢 | Pre-mainnet | ~1 hour (deploy Safe + `transferOwnership`) |
| 10 | MockUSDC instead of canonical Arc USDC | 🟢 | Real settlement | When Canteen publishes USDC address |
| 11 | Provider strategy is Gemini placeholder | 🟢 | Real alpha | Replace `generate_signal()` with quant model |

---

## 🔴 Critical — fix these before any real proof or money moves

### 1. Poseidon ↔ keccak commitment-root mismatch

**What it blocks.** Every `SignalMarket.submitStatsProof(...)` call. The real
Groth16 verifier is live at `0x403Fe0…2ebc` but unreachable in practice — any
proof you generate will fail the on-chain commitment-root check.

**Why it exists.**

- [circuits/zkroute/track_record.circom](circuits/zkroute/track_record.circom)
  chains per-signal commitments using `Poseidon(2)` and produces the
  `commitmentRoot` public input as the final Poseidon hash.
- [contracts/contracts/CommitReveal.sol](contracts/contracts/CommitReveal.sol)
  `getCommitmentRoot` chains the *same* hashes using **keccak256** instead:

  ```solidity
  commitmentRoot_[msg.sender] = keccak256(
      abi.encodePacked(commitmentRoot_[msg.sender], hash)
  );
  ```

  Then [SignalMarket.sol](contracts/contracts/SignalMarket.sol) compares
  the circuit's Poseidon root against the on-chain keccak root:

  ```solidity
  require(bytes32(pubSignals[3]) == onChainRoot, "commitment root mismatch");
  ```

  These two roots will never agree.

**Fix options.**

| Option | Where | Tradeoff |
|--------|-------|----------|
| A. Change the circuit to use a keccak-friendly accumulator | `track_record.circom` | Circom doesn't have a cheap keccak template; constraint count explodes (~150k more) |
| B. Change `CommitReveal.getCommitmentRoot` to use Poseidon | `CommitReveal.sol` | Needs an EVM Poseidon implementation (≈90k gas per commit) |
| C. Move the chaining into the circuit as a public input and drop the on-chain root entirely | both | Simplest. The circuit takes a Merkle root computed off-chain; on-chain just verifies individual commitments exist. |
| D. Use an off-chain attestor that signs the Poseidon root over the on-chain history | `SignalMarket.sol` + new offchain service | Introduces a trust assumption — defeats the point |

**Recommended:** **Option C.** Modify `submitStatsProof` to accept the
`commitmentRoot` claimed by the circuit and verify that the *individual signal
hashes* in the circuit's private inputs all exist on-chain (via Merkle proofs
or by indexing). Most practical: have the prover supply a list of `signalId`s
in their proof, and the contract iterates the on-chain commitments to confirm
they match the count and hashes the circuit committed to.

**Estimated effort:** 1–4 hours for someone fluent in circom + Solidity.

---

### 2. Gemini API key appeared in chat history

**What it blocks.** Nothing functional — but the key was pasted in chat
during this session and now lives in conversation history. Treat it as
compromised.

**Fix.**

1. Open Google Cloud Console → **APIs & Services → Credentials**.
2. Find the key and click **Regenerate** (or delete + create a fresh one).
3. Update `.env`:

   ```bash
   sed -i '' 's|^GEMINI_API_KEY=.*|GEMINI_API_KEY=<new-key>|' .env
   ```

4. Restart the provider agent:

   ```bash
   pkill -f agents.provider.agent
   SIGNAL_INTERVAL_SECONDS=60 REVEAL_DELAY_SECONDS=30 \
     nohup python3 -m agents.provider.agent > /tmp/zkroute_provider.log 2>&1 &
   ```

**Estimated effort:** 5 minutes.

---

## 🟡 Needed for a credible submission

### 3. Circle Wallets stuck in `[SIM]` mode

**What it blocks.** The buyer agent logs
`[SIM] Would trade ETH SHORT 3%` but never moves real USDC. The signal flow
proves the privacy + commit-reveal claim end-to-end, but there's no actual
position being opened on a real DEX.

**Why it exists.** `.env` has `CIRCLE_API_KEY` set (test tier) but
`CIRCLE_ENTITY_SECRET` and `CIRCLE_WALLET_ID` are empty. The agent code in
[`buyer/agent.py`](agents/buyer/agent.py) explicitly falls back to sim when
`CIRCLE_WALLET_ID` is unset.

**Fix.**

1. In Circle Console → **Developer → Wallets**, generate an entity secret
   ciphertext (it's a per-account encryption envelope; the console walks you
   through it).
2. Create a programmable wallet on Arc and copy its `walletId`.
3. Fill `.env`:

   ```env
   CIRCLE_ENTITY_SECRET=<ciphertext>
   CIRCLE_WALLET_ID=<uuid>
   ```

4. Fund the Circle wallet with a small USDC float.
5. Restart the buyer agent. The `_execute_trade` call now hits Circle's
   `/v1/w3s/wallets/transfers` endpoint.

**Estimated effort:** 30 minutes once the creds are minted.

**Note.** Today's `_execute_trade` uses Circle's transfers API as a stand-in
for a swap. For a real demo, replace with Circle's swap endpoint or a
direct DEX integration on Arc.

---

### 4. Zero real providers / buyers

**What it blocks.** **30% of the judging rubric** (traction). Currently only
the demo deployer is subscribed to a single demo provider — the entire
marketplace has one row.

**Why it exists.** Pure outreach work; not a code problem.

**Fix.**

1. Identify 3–5 CT traders or paid Discord/TG group operators who already
   claim alpha publicly. The pitch is: "we verify your track record for free,
   you keep your strategy private."
2. Send each of them a 30-second video of the live `/marketplace` + `/buyer`
   pages with their track record ZK-proven.
3. Onboard them: they generate keypairs (CLI helper in
   [`agents/README.md`](agents/README.md)), register on `/provider`, share
   the listing.
4. Recruit 10–20 subscribers from their existing audiences.

**Target for hackathon submission:** 3 providers, 10–20 subscribers, ≥1
real ZK proof submitted (assuming blocker #1 is fixed first).

**Estimated effort:** Days. This is the longest pole.

---

### 5. No recorded demo video

**What it blocks.** Hackathon submission line item.

**Fix.** With the system running locally:

1. Open three terminals + one browser.
   - Terminal 1: `tail -f /tmp/zkroute_provider.log` (showing Gemini → commit
     → encrypt → relay)
   - Terminal 2: `tail -f /tmp/zkroute_buyer.log` (showing decrypt → execute
     → report)
   - Terminal 3: `arc-canteen rpc eth_blockNumber` periodically to show
     real-chain activity
   - Browser: `http://localhost:3000/buyer` with dashboard open
2. Record a 3-minute walkthrough:
   - 0:00 — the problem (signals can't be sold without leaking strategy)
   - 0:30 — buyer dashboard, point at "signals never shown" caption
   - 1:00 — show the provider log committing a new signal on Arc
   - 1:30 — show the buyer log decrypting that signal, risk-validating, and
     opening a position
   - 2:00 — show the dashboard update with the new position
   - 2:30 — wrap with the ZK + nanopayments value prop

**Estimated effort:** 1–2 hours including 1 retake.

---

### 6. Backend has no auth on relay writes

**What it blocks.** Production security. Anyone with the backend URL can POST
to `/signals/relay`, `/buyer/positions`, `/buyer/rejections`. The on-chain
subscription check exists but only as a row-existence guard, not an identity
check.

**Why it exists.** MVP scope cut auth to ship faster.

**Fix.**

1. Add a `WalletAuth` FastAPI dependency that reads `Authorization: Bearer
   <signed-nonce>` and recovers the signer's address via EIP-191.
2. Require it on:
   - `POST /signals/relay`: signer must equal `request.provider`
   - `POST /buyer/positions`, `POST /buyer/rejections`: signer must equal
     `request.buyer` OR the authorized agent for that subscription
3. Add a `/auth/nonce` endpoint that issues short-lived nonces.

**Estimated effort:** ~2 hours.

---

### 7. Frontend `NEXT_PUBLIC_ARC_RPC_URL` leaks Canteen `swrm_…` token

**What it blocks.** Deploying the frontend publicly. Anyone visiting your
Vercel page can read the token from the JS bundle and use your Canteen RPC
allotment.

**Why it exists.** Canteen's RPC URL is auth-bearing. We mirrored it to the
public-side env for convenience.

**Fix.** Pick one:

| Option | Effort |
|--------|--------|
| Rotate the token via `arc-canteen rotate-rpc-key` whenever you redeploy the frontend | 1 min, but no real protection |
| Proxy RPC calls through your backend: backend holds the token in `.env`, exposes `POST /rpc` that forwards to Canteen, frontend points at `NEXT_PUBLIC_RPC_URL=https://your-backend/rpc` | ~1 hour |
| Use a public unauthenticated Arc RPC if Canteen publishes one | 1 min |

**Estimated effort:** ~1 hour for the proxy.

---

## 🟢 Pre-mainnet polish

### 8. Single-contribution trusted setup

**What it blocks.** Mainnet credibility. A single dev contribution is fine
for testnet demos but cryptographically insufficient for real money — if that
one machine was compromised, the verifier is broken (provers can mint fake
proofs).

**Fix.** Run a multi-party ceremony before mainnet:

1. Publish the `track_record_0.zkey` from `circuits/build/`.
2. Recruit ≥10 contributors (CT, allies, judges).
3. Each contributor runs:

   ```bash
   npx snarkjs zkey contribute track_record_N.zkey track_record_N+1.zkey \
     --name="<their handle>" -v
   ```

4. Publish a record of contributions; final `.zkey` becomes the mainnet
   reference.

**Estimated effort:** ~1 week of coordination, ~10 minutes of actual work.

---

### 9. SQLite + no rate limits

**What it blocks.** Scale. SQLite locks the whole DB on writes; ten concurrent
signal relays will serialize. No rate limits means a buggy or malicious agent
can DDoS the relay.

**Fix.**

1. Set `DATABASE_URL=postgresql+psycopg://...` in `.env`. SQLModel migration
   is zero-code.
2. Add `slowapi` for per-endpoint rate limits:
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=lambda req: req.client.host)
   @router.post("/signals/relay")
   @limiter.limit("10/minute")
   def relay_signal(...): ...
   ```

**Estimated effort:** ~half day.

---

### 10. Owner is deployer EOA, not multisig

**What it blocks.** Pre-mainnet operational safety. If the deployer key is
compromised, the attacker can `pause()`, `slash(...)` any provider, and
`setSignalPrice(massive)` to drain buyer floats via revenue accrual.

**Fix.**

1. Deploy a Safe multisig (2-of-3 or 3-of-5) on Arc with trusted signers.
2. Call:
   ```solidity
   ProviderRegistry.transferOwnership(safe)
   SignalMarket.transferOwnership(safe)
   ```

**Estimated effort:** ~1 hour.

---

### 11. MockUSDC instead of canonical Arc USDC

**What it blocks.** Real-world settlement. Today's `USDC_ADDRESS` in `.env`
points at the test ERC20 the deploy script minted (`0x999f73De…dDB6Ed`).
Buyers can't deposit "real" USDC.

**Fix.**

1. Find the canonical USDC address from Circle's Arc docs.
2. Update `.env`: `USDC_ADDRESS=<real>`.
3. Re-deploy only `SignalMarket` with the new USDC (the registry's USDC is
   immutable — also needs redeploy).
4. Update [deployments/arc-testnet.json](deployments/arc-testnet.json).

**Estimated effort:** ~30 minutes once the canonical address is known.

---

### 12. Provider strategy is a Gemini placeholder

**What it blocks.** Real alpha. Gemini returning "LONG ETH because RSI looks
consolidating" is not a strategy — it's a coherent-sounding hallucination.

**Fix.** In [`agents/provider/agent.py`](agents/provider/agent.py), replace
`generate_signal()` with your actual quant model. The rest of the agent
pipeline doesn't care how the direction is chosen — it just commits,
encrypts, and reveals whatever you return.

**Estimated effort:** Variable. The point of zkRoute is that you can plug in
*any* strategy here.

---

## Closing checklist for "hackathon submission ready"

- [ ] Fix Poseidon ↔ keccak (#1)
- [ ] Submit at least one real ZK proof on-chain
- [ ] Switch buyer agent out of `[SIM]` mode (#3)
- [ ] Onboard ≥3 real providers (#4)
- [ ] Record demo video (#5)
- [ ] Rotate Gemini key (#2)

When all six are checked, you're at ~85–90% of the original judging rubric.
