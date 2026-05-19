# zkRoute

> **An agent-to-agent signal marketplace where alpha is monetized without being revealed.**
> Powered by Arc (Circle's USDC L2), Circle Wallets, x402 nanopayments, and Groth16 zero-knowledge proofs.

[![CI](https://img.shields.io/badge/CI-Hardhat%20%2B%20pytest-success)](.github/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue)
![Solidity](https://img.shields.io/badge/solidity-0.8.24-363636)
![Python](https://img.shields.io/badge/python-3.11+-blue)
![Next.js](https://img.shields.io/badge/next.js-14-black)

---

## Table of contents

- [The problem](#the-problem)
- [The insight](#the-insight)
- [Whom it helps, and how](#whom-it-helps-and-how)
  - [Signal providers](#signal-providers)
  - [Buyers / traders](#buyers--traders)
  - [The protocol](#the-protocol)
  - [The broader market](#the-broader-market)
- [How it actually works](#how-it-actually-works)
- [Defense in depth — the privacy layers](#defense-in-depth--the-privacy-layers)
- [Why Arc + Circle, specifically](#why-arc--circle-specifically)
- [How zkRoute compares](#how-zkroute-compares)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quickstart](#quickstart)
- [Arc testnet deployment](#arc-testnet-deployment)
- [Subsystem docs](#subsystem-docs)
- [Security model](#security-model)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The problem

There are two sides to alpha distribution, and both are broken.

### The provider's problem

A quant trader with real edge has no good way to sell it.

- Selling the signal means **giving it away**. The buyer reverse-engineers it, replicates it, posts it in a free Telegram, and the edge dies in days.
- Running a managed fund is the alternative — but that means custody, regulatory headache, AUM minimums, and a permanent commitment.
- The result: **the most valuable strategies stay locked inside private desks and tight-knit groups**. They never reach the buyers who would pay the most for them, because the seller can't trust the buyer not to copy.

### The buyer's problem

A trader who wants vetted signals has no way to verify a provider is legit.

- Track records are **screenshots**. Photoshop is free.
- Win rates are **self-reported**. Survivorship bias is normalized.
- "Audited" usually means "this PDF says I have a 70% win rate." Audited by whom?
- There's no **mathematical** way to prove a track record without leaking the strategy that produced it.
- The result: **buyers default to either cheap-and-fake Telegram pumps, or expensive-and-opaque hedge funds**. Nothing in between.

zkRoute fixes both sides. Providers prove their track record with zero-knowledge proofs. Buyers subscribe, and their **autonomous agent** executes the trades — but the human buyer never sees the raw signal. The strategy stays private; the performance is mathematically verified; reverse-engineering becomes substantially harder than any existing alternative.

---

## The insight

> **You don't sell the signal. You don't even show the signal. You sell *execution* of the signal by the buyer's own agent.**

This is the single sentence the entire protocol is built around.

The provider's agent talks directly to the buyer's agent. Humans on the buyer side only see **portfolio performance** — positions opened, PnL, drawdown. They never see "BUY ETH at $3,420 when RSI crosses 30." The signal is encrypted end-to-end between agents using NaCl box (Curve25519 + XSalsa20-Poly1305).

What changes when you move the locus of control from human → agent:

| Before (human reads signals) | After (agent reads signals) |
|---|---|
| Signal value decays the second the human reads it | Signal stays encrypted, only the agent ever sees it |
| The buyer can screenshot the signal and resell it | The buyer can't extract a signal they never receive |
| The provider must trust the buyer's discretion | The provider's only attack surface is the buyer's machine |
| Track records are self-reported | Track records are ZK-proven against a public commit log |
| Settlement requires trust or middlemen | Settlement is per-signal, on-chain, sub-cent |

Reverse-engineering doesn't become impossible — a determined buyer could in principle pattern-match from trade logs over a long timespan. But "I read the signal" is a 1-second extraction. "I reconstructed the strategy from a year of position data" is a research project that costs more than buying the next year's signals.

---

## Whom it helps, and how

### Signal providers

**Who:**

- Crypto-Twitter traders who already post calls and want **credibility you can verify cryptographically**, not just follower-count.
- Operators of paid Discord / Telegram alpha groups who want to **scale revenue without losing their edge** to leakers.
- Quant researchers with strong backtests who can't run a fund — too small for AUM, no regulatory appetite, but want to monetize their model live.
- ML / on-chain analysts who have novel data pipelines but no go-to-market.

**What zkRoute gives them:**

1. **Cryptographic track record.** A Groth16 proof binds the provider's claimed win rate and total return to a public log of committed signals on Arc. No screenshots, no trust assumptions. The proof reveals the *statistics* and hides the *strategy*.
2. **Strategy stays private — forever.** The signals themselves are never published in plaintext anywhere. Each signal is encrypted to each subscriber's agent pubkey. Even the relay backend cannot read them.
3. **Per-signal revenue in USDC.** Subscribers pay `$0.01` per signal received via x402 nanopayments on Arc. Revenue accrues immediately, claimable anytime via `claimRevenue()`. No 30-day Stripe payouts, no chargebacks.
4. **Self-classified frequency.** Provider tags their cadence (HFT / Intraday / Medium / Swing / Macro). Buyers filter on it. The protocol doesn't restrict any frequency, but high-cadence providers should expect more trades visible in subscriber wallets — that's a privacy tradeoff buyers are aware of.
5. **Yield on idle revenue (planned).** USYC integration parks accumulated USDC in a tokenized money-market fund between payouts — providers earn yield instead of letting USDC sit dead.
6. **Slashing as credibility signal.** Each provider stakes 100 USDC on registration. Fraudulent proofs get slashed by governance. The bond is **visible** — buyers can see who has skin in the game.

**Why a provider should choose zkRoute over a Telegram group:**

- Their Telegram alpha is worth less every month as members leak it for free.
- Their reputation is hostage to a screenshot war.
- They have no monetization-on-rails: they're charging via OpenSea NFTs or Stripe links and dealing with refund drama.

zkRoute replaces *all* of that with a verifiable, encrypted, instantly-paid channel.

### Buyers / traders

**Who:**

- Retail and prosumer traders tired of Telegram pump groups and 0%-attribution "guru" subscriptions.
- DeFi natives who already trust their wallet to programmable code and want **vetted external signals** to feed it.
- Treasuries and DAOs running on-chain allocations who need **verifiable inputs** they can audit.
- Quant juniors / aspiring traders who want exposure to professional strategies without paying hedge-fund fees.

**What zkRoute gives them:**

1. **Mathematically-verified providers.** Before subscribing, the buyer sees `68% win rate · 1.4 Sharpe · 12% max drawdown — ZK PROVEN`. The badge is real. They can verify the proof on Arc themselves.
2. **Risk bounds the buyer sets.** Before any signal executes, the buyer pre-configures:
   - **Max position size** (e.g. "never more than 5% per trade")
   - **Max leverage** (1x by default; up to 10x ceiling)
   - **Allowed assets** ("only ETH and BTC")
   - **Daily VaR limit** ("max 3% of portfolio loss in a day")
   - **Kill switch** (pauses all signal execution instantly)

   The buyer agent enforces these on every decrypted signal. A provider screaming "10x long DOGE" sees nothing happen if it violates the buyer's bounds.
3. **Privacy through encryption + agency.** The buyer's autonomous agent receives the signal, validates it, executes it. The **human never sees the raw signal content** — only their portfolio state. So they cannot leak what they cannot read.
4. **Per-signal pricing in stablecoins.** At `$0.01` per signal, a medium-frequency provider (4–24 signals/day) costs ~$2–$5/month. Compare with a $200/month Telegram subscription.
5. **No custody.** Funds stay in a buyer-controlled Circle Programmable Wallet. The agent has scoped permissions; the buyer can revoke at any time.
6. **A dashboard, not a feed.** The buyer sees positions, PnL, equity curve — what they care about. Not 200 noisy "ETH looking good 🔥" messages a day.

**Why a buyer should choose zkRoute over a Telegram group:**

- They never have to wonder whether the signal is real.
- They never have to FOMO into a trade because the group chat exploded.
- They sleep through volatile nights — the agent acts within preset bounds.
- They keep custody and risk control.

### The protocol

**Who:**

- The protocol itself is a thin layer collecting **2–5%** on every signal payment via `PROTOCOL_FEE_BPS = 300` (3%).
- Treasury accrues in a separate `treasuryBalance` accounting bin — never mixed with buyer floats or provider revenue. Withdraw is owner-gated.

**What it does:**

1. Routes encrypted signals (without ever reading them).
2. Verifies ZK proofs on-chain via the deployed `Groth16Verifier`.
3. Processes per-signal nanopayments (USDC settled on Arc with sub-second finality).
4. Enforces hard caps on subscription parameters so a provider can't trick a naïve buyer into 50x leverage.
5. Maintains the commitment registry that makes track records unfakeable.

The protocol earns when the network earns. Everything else flows to providers and stays with buyers.

### The broader market

If zkRoute works at scale, the second-order effects compound.

- **Alpha becomes liquid.** A 24-year-old running a sharp on-chain volume-flow model can monetize it the same week they have their first month of proven returns. Today they'd need a year of social capital + a Substack + a Stripe account + audit threats.
- **Trust gets cheaper.** A ZK-proven track record is a public good. Once enough providers are on-chain with verified stats, "verified track record" stops being a luxury claim and becomes table-stakes.
- **Hedge-fund economics get unbundled.** Most of what a fund sells is "we vetted these strategies and we execute them for you." zkRoute replicates that with a smart contract + an agent, at sub-cent operational cost.
- **Buyers become contributors.** Subscriber-side performance data (aggregated, anonymized) is itself valuable — it's a real-money endorsement of which providers actually deliver. The protocol can surface this without revealing individual portfolios.

---

## How it actually works

A single signal's lifecycle, from generation to settlement:

```
T+0    Provider's strategy generates a directional call:
       "ETH long, 3% suggested size"
       
T+1    Provider agent computes:
         signal_id = random_32_bytes()
         salt      = random_32_bytes()
         hash      = keccak256(signal_id, direction, asset, salt)
       Publishes `hash` to CommitReveal contract on Arc.
       The signal content is NOT on chain. Only the hash.
       
T+2    Provider agent fetches the active subscriber list from the
       backend relay and encrypts the signal once per subscriber
       using NaCl box (the buyer's agent pubkey + the provider's
       NaCl private key).
       
T+3    Provider agent POSTs each ciphertext to /signals/relay.
       The backend cannot decrypt — it's a routing layer.
       
T+4    Buyer agent polls /signals/pending on its next 30s tick,
       receives the ciphertext, decrypts with its own NaCl
       private key.
       
T+5    Buyer agent runs the signal against the buyer's pre-set
       risk bounds. If it fails any check (wrong asset, oversize,
       daily VaR exhausted, kill switch on), it's rejected and
       logged to /buyer/rejections. The human will see "rejected"
       on their dashboard, but never the signal content.
       
T+6    If accepted, the buyer agent executes the trade via Circle
       Programmable Wallets — sized DOWN to the buyer's max
       position cap if the provider's hint exceeded it.
       
T+7    Buyer agent calls SignalMarket.processSignalPayment on Arc.
       0.01 USDC is deducted from the buyer's float:
         - 0.0097 USDC → providerRevenue[provider]
         - 0.0003 USDC → treasuryBalance (3% protocol fee)
       
T+8    Buyer agent POSTs the position to /buyer/positions. The
       dashboard updates with "ETH LONG 3% @ $3,420" — no signal
       content, just the resulting trade.
       
T+300  After REVEAL_DELAY_SECONDS (default 5 min), the provider
       agent fetches the resolution price from Pyth and calls
       CommitReveal.reveal(...) with the original direction,
       asset, salt. The contract verifies the preimage matches
       the original commitment. Outcome (win/loss) is recorded
       on chain.
       
       The 5-min delay is the provider's HEAD-START: they execute
       their own position before subscribers receive the signal.

T+∞    Every N signals (the circuit is sized at N=100), the
       provider runs the Groth16 prover off-chain over their
       full commitment history, generating a proof that:
         "I know N signals whose commitments are exactly the
          rolling root in CommitReveal, whose outcomes against
          real prices produce this win rate and this total return."
       They submit the proof via SignalMarket.submitStatsProof.
       The verifier validates on Arc; the marketplace UI updates
       the provider's "ZK PROVEN" badge.
```

The human buyer experiences this as: their dashboard quietly fills with positions, marked "from ETH Momentum Alpha." They never see a signal. They never reveal anything by reading anything.

---

## Defense in depth — the privacy layers

Information leakage is the failure mode that kills every previous attempt at signal marketplaces. zkRoute stacks four independent defenses; defeating the system requires beating *all* of them.

### Layer 1 — Encrypted execution

Signal content is end-to-end encrypted between the provider's NaCl keypair and each buyer **agent's** NaCl keypair. The relay backend stores ciphertext; the agent's private key never leaves the buyer's wallet sub-account.

**What this stops:** A relay operator, a man-in-the-middle, an outside attacker who breaches the database. None of them can read signals.

### Layer 2 — Provider head-start

Reveal happens at `T + REVEAL_DELAY_SECONDS` (default 5 minutes after commit). The provider's own position fills first, with the best price. Subscribers' agents get the encrypted signal at `T + ~30s` (one buyer-poll cycle) but the *outcome window* the provider commits against is the wider one.

**What this stops:** Subscribers can't beat the provider's fill — even if they decode the signal instantly, they're chasing the same liquidity from a worse price.

### Layer 3 — Signal abstraction

The buyer agent receives only the operationally-necessary bits:

```jsonc
{
  "signal_id": "...",
  "asset": "ETH",
  "direction": 1,           // long
  "size_hint_pct": 3,
  "commit_time": 1716135600
}
```

It does **not** receive the entry trigger ("RSI < 30"), the indicator parameters, the data source, the timing logic, the stop-loss model. Even if the buyer is malicious and dumps every signal they receive to a public spreadsheet, they leak `(asset, direction, size, time)` — not the *strategy* that produced those four values.

**What this stops:** Trivial replication. A subscriber building a leaderboard of (asset, direction, time) tuples still doesn't know *why* the signal fired, so they can't anticipate the next one without buying it.

### Layer 4 — Commit-reveal (anti-cherry-pick)

The biggest gamesman's attack: a fake provider runs 10 strategies in parallel, sees which one happened to have a good week, retroactively claims that one's track record.

The commit-reveal scheme on Arc kills this:

1. Every signal hash is committed to chain **before** the market moves (block N).
2. Arc's sub-second finality means the commit timestamp is tight — there's no window to commit "after the fact and pretend you didn't."
3. The ZK proof can only count signals that exist as committed hashes in CommitReveal.
4. A signal that wasn't committed before the move **doesn't count**, even if the provider knows the outcome.

**What this stops:** Selective track-record reporting. The only signals you can claim are the ones you publicly bet on first.

---

## Why Arc + Circle, specifically

zkRoute would be *possible* on Ethereum mainnet, but only *economical* on Arc. Three properties of the Circle stack matter:

| Property | Ethereum L1 | Arc | Why it matters for zkRoute |
|---|---|---|---|
| **Gas cost per commit** | ~$2 at 30 gwei + $2k ETH | ~$0.01 | A medium-frequency provider commits 96 signals/day. On Ethereum: $192/day in gas — infeasible. On Arc: under $1/day. |
| **Per-signal nanopay** | Not viable (gas > payment) | `$0.000001` minimum | Sub-cent pricing per signal is the entire monetization model. Doesn't exist on Ethereum. |
| **Finality** | ~12 min | Sub-second | Sub-second finality makes the commit→reveal window tight enough that backdating attacks become statistically infeasible. |
| **Gas token** | ETH (volatile) | **USDC** | Providers earn USDC, pay gas in USDC, claim revenue in USDC. No volatility leakage between earning and spending. |
| **Paymaster** | Bespoke per chain | Built-in (Circle) | Buyers and providers never need to hold ETH/native. Onboarding is one stablecoin instead of two assets. |

**Circle tools used end-to-end:**

| Tool | Where it's used |
|---|---|
| **Gateway Nanopayments (x402)** | Core payment rail. Per-signal USDC micropayments, gas-free for the user, batched settlement under the hood. |
| **Circle Programmable Wallets** | Buyer agent's signing key + scoped permissions. Buyer authorizes the agent address at subscribe time; the agent can call `processSignalPayment` and execute trades within the buyer's risk bounds, but cannot exfiltrate funds. |
| **Paymaster** | All fees paid in USDC. No need for a buyer or provider to ever touch native gas. |
| **Smart Contracts (Arc)** | On-chain commitment registry, ZK proof verification, provider staking/slashing, subscription state, fee accounting. |
| **USYC (planned)** | Idle provider revenue parked in tokenized money-market fund between payouts. Providers earn ~5% yield on the USDC sitting in their `providerRevenue` balance. |

If you swapped Arc for Ethereum L1, zkRoute becomes "a $192/day side project." If you swap it for a generic L2 without Circle's stablecoin-native economics, you lose USDC-as-gas, Paymaster, and the nanopayment rail.

---

## How zkRoute compares

| | Telegram alpha group | Copy-trading platform (eToro / Bybit) | Hedge fund | **zkRoute** |
|---|---|---|---|---|
| **Track record proof** | Screenshots, trust-based | Platform-vetted (~trust the platform) | Audited annually | **ZK-proven on-chain, real-time** |
| **Strategy secrecy** | Lost the moment a member leaks | Lost (all trades visible) | Preserved | **Preserved (encrypted execution)** |
| **Payment friction** | Stripe / crypto / NFT — high | Account-managed | LP commitment | **Per-signal USDC, sub-cent** |
| **Buyer custody** | Buyer trades manually | Platform-custodial | LP-custodial | **Buyer-custodial via Circle Wallet** |
| **Buyer risk control** | None (FOMO) | Crude per-trader limits | None (LP terms) | **Per-trade hard caps + kill switch** |
| **Provider monetization speed** | Slow (trust-build) | Slow (platform onboarding) | Glacial (AUM raise) | **Instant (per-signal payouts)** |
| **Reverse-engineering cost** | Trivial (read the message) | Trivial (copy the trade) | High (opaque) | **High (encrypted + abstracted + lagged)** |
| **Onboarding friction** | Low | Medium | Very high | **Low (wallet + 100 USDC bond)** |

The closest comparison is **a hedge fund**. zkRoute is what a hedge fund looks like when you replace the manager, the auditor, the back-office, the prime broker, and the LP agreement with a smart contract, a ZK proof, an agent, and a stablecoin.

---

## Architecture

```
┌──────────────────────────┐                       ┌──────────────────────────┐
│      PROVIDER AGENT      │                       │       BUYER AGENT        │
│                          │                       │                          │
│  generate signal         │                       │  poll /signals/pending   │
│      │                   │                       │      │                   │
│      ▼                   │                       │      ▼                   │
│  commit hash ─► Arc ─┐   │                       │  decrypt (NaCl box)      │
│      │               │   │                       │      │                   │
│  encrypt → buyer pk  │   │     ┌────────────┐    │      ▼                   │
│      │               │   │     │  BACKEND   │    │  risk-bounds check       │
│      ▼               │   │     │  (FastAPI) │    │      │                   │
│  POST /signals/relay │───┴────►│            │◄───┘      ▼                   │
│      │               │         │            │     execute via Circle Wallet │
│      ▼               │         │  signal    │           │                   │
│  reveal outcome ─► Arc         │  relay +   │           ▼                   │
│      │                         │  marketplace     processSignalPayment ─► Arc
│      ▼                         │  data layer│           │                   │
│  generate Groth16 ─► Arc       │            │           ▼                   │
│  (submitStatsProof)            └────────────┘     report PnL ─► /buyer      │
└──────────────────────────┘                       └──────────────────────────┘
              │                                                  │
              └──── Pyth Hermes (oracle prices) ◄────────────────┘
```

| Layer | What runs there |
|-------|-----------------|
| **Arc (USDC L2)** | `ProviderRegistry`, `CommitReveal`, `SignalMarket`, `Groth16Verifier` |
| **Backend (FastAPI)** | Encrypted-signal relay bus, marketplace listings, position tracking |
| **Agents (Python)** | Autonomous provider + buyer loops; NaCl encryption; oracle reads; trade execution |
| **Frontend (Next.js)** | Marketplace browser, subscribe modal, portfolio dashboard, wagmi on-chain calls |
| **Circuits (Circom + snarkjs)** | `track_record.circom` — Groth16 over 100 signal commitments |

## Repository layout

| Path | Purpose | Docs |
|------|---------|------|
| [contracts/](contracts/) | Solidity contracts + Hardhat tests | [contracts/README.md](contracts/README.md) |
| [circuits/](circuits/) | Circom circuit + Groth16 trusted-setup scripts | [circuits/README.md](circuits/README.md) |
| [backend/](backend/) | FastAPI signal relay + marketplace data layer | [backend/README.md](backend/README.md) |
| [agents/](agents/) | Provider + buyer Python agents | [agents/README.md](agents/README.md) |
| [frontend/](frontend/) | Next.js 14 marketplace UI | [frontend/README.md](frontend/README.md) |
| [scripts/](scripts/) | Setup, demo seed, address loader | [scripts/README.md](scripts/README.md) |
| [deployments/](deployments/) | Canonical address book per network | [arc-testnet.json](deployments/arc-testnet.json) |
| [.github/workflows/](.github/workflows/) | CI: Hardhat tests, pytest, Next.js build | — |
| [DEPLOYMENT.md](DEPLOYMENT.md) | End-to-end deploy walkthrough | — |
| [UPDATES.md](UPDATES.md) | Detailed session-by-session log | — |
| [BLOCKERS.md](BLOCKERS.md) | Outstanding issues, sorted by severity | — |

## Quickstart

Requires: **Node ≥ 18**, **Python 3.11**, **jq**. Optional: **circom 2.1.6+**, **snarkjs**.

```bash
git clone https://github.com/<you>/zkroute.git
cd zkroute
bash scripts/setup.sh                    # installs all subtree deps
cp .env.example .env                     # fill in keys before running anything

# In four terminals:
cd contracts && npx hardhat node         # 1. local EVM
cd contracts && npm run deploy:local     # 2. deploy contracts
uvicorn backend.main:app --reload        # 3. backend API
cd frontend && npm run dev               # 4. UI at http://localhost:3000
```

Then start one provider and one buyer agent:

```bash
python -m agents.provider.agent
python -m agents.buyer.agent
```

For Arc testnet deploy, see [scripts/DEPLOY_ARC.md](scripts/DEPLOY_ARC.md). For the full production walkthrough see [DEPLOYMENT.md](DEPLOYMENT.md).

## Arc testnet deployment

The single source of truth for deployed addresses is
[deployments/arc-testnet.json](deployments/arc-testnet.json). Every other doc
references that file. To export the addresses as `.env` lines:

```bash
eval "$(scripts/load_addresses.sh)"      # into current shell
scripts/load_addresses.sh >> .env        # into your .env file
```

### Currently deployed on Arc testnet (Canteen)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| MockUSDC            | `0x999f73DeA290960Afbd2f6e582F48bEfdFfDB6Ed` |
| ProviderRegistry    | `0x932Cb43D99e1CFB5D275Be0c87FA3313f76a6aeE` |
| CommitReveal        | `0x6e6c34e5781D45C5b0c91ecf258EAfaccc52fCDe` |
| Groth16Verifier     | `0x403Fe0408976b518b2952BdF590135Ec6ba12ebc` |
| SignalMarket        | `0x02c40758eB9932257F056fbB60714ccbdA8C4bd4` |

### Network parameters

| Field             | Value |
|-------------------|-------|
| Chain ID          | `5042002` |
| RPC URL           | Issued per-user by `arc-canteen rpc-url` (auth-bearing) |
| Native gas token  | USDC (via Circle Paymaster) |

## Subsystem docs

Each subtree has its own README with full detail:

- **[contracts/README.md](contracts/README.md)** — every contract function, event, modifier, storage slot; Hardhat test layout; deploy ordering.
- **[circuits/README.md](circuits/README.md)** — Poseidon hashing, input layout, trusted setup, proof generation, verifier swap procedure.
- **[backend/README.md](backend/README.md)** — every endpoint with request/response schema, DB schema, in-memory test fixtures, production hardening notes.
- **[agents/README.md](agents/README.md)** — provider + buyer loops, NaCl box encryption, risk-bounds enforcement, Pyth oracle integration, Circle Wallet trade execution.
- **[frontend/README.md](frontend/README.md)** — page routes, wagmi hooks, on-chain integration points, design system tokens.
- **[scripts/README.md](scripts/README.md)** — every helper script in detail.

## Security model

### Guarantees

1. **Track record is verifiable.** A submitted Groth16 proof confirms that the claimed win-rate and total-return statistics are correct for a set of commitments rolled into a public root on Arc. No screenshots, no self-reports.
2. **Commitments are timestamped.** Providers must commit each signal hash *before* the market moves; reveals later have to match the preimage. Backdating is impossible within Arc's finality bounds.
3. **Stake is bonded.** A provider has 100 USDC at risk; the owner (eventually a multisig) can slash for fraud.
4. **Buyer never sees the signal.** The signal is end-to-end encrypted to the buyer agent's NaCl public key. Only the agent's private key (held in a Circle Programmable Wallet) can decrypt.
5. **Agent operates inside hard limits.** The buyer pre-configures max position, leverage, daily VaR, allowed assets, and a kill switch. The contract enforces upper bounds (`MAX_POSITION_BPS=50%`, `MAX_LEVERAGE_BPS=10x`, `MAX_DAILY_VAR_BPS=20%`).
6. **Funds are partitioned.** On-chain treasury, provider revenue, and buyer floats are tracked in three separate accounting bins. `withdrawFees` only withdraws protocol-fee accruals; buyer floats and provider revenue are never sweepable by the owner.

### Out-of-scope today

- **The buyer's machine is trusted.** A motivated buyer could read decrypted signals from their own agent's memory. Future work: TEE-based buyer agents (signals decrypted inside an enclave, never exposed to the host).
- **Pattern-matching across long histories.** A buyer can in principle reverse-engineer a strategy by observing many trades. Provider head-start (~5 min) reduces the value of doing so but doesn't eliminate it.
- **Backend availability.** The signal relay is a single FastAPI instance with SQLite by default. Production should use Postgres + Redis/NATS for durability.
- **Trusted setup ceremony.** Today's `Groth16Verifier` was generated with a single dev contribution. Mainnet requires a multi-party ceremony.
- **Commitment root hash mismatch.** A known bug — circuit chains via Poseidon, on-chain chains via keccak. See [BLOCKERS.md](BLOCKERS.md) item #1.

### Reporting vulnerabilities

Please email `security@zkroute.example` (replace with your real channel) with encrypted disclosure. Do not open public issues for security bugs.

## Roadmap

- [x] MVP contracts (registry, commit-reveal, market)
- [x] Encrypted relay (NaCl box, end-to-end agent-to-agent)
- [x] Risk-bound buyer agent
- [x] Groth16 circuit + verifier swap path
- [x] Production-grade contract hardening (reentrancy, pausable, treasury split)
- [x] CI: contract tests + backend pytest + agent pytest + Next.js build
- [x] Deployed on Arc testnet (Canteen)
- [x] Real Groth16 verifier swapped in
- [ ] **Fix Poseidon/keccak commitment-root mismatch** (gates first real proof)
- [ ] First real ZK proof submitted on-chain
- [ ] Circle Wallets live (out of `[SIM]` mode)
- [ ] x402 facilitator integration tests
- [ ] 3–5 real signal providers onboarded
- [ ] Multi-party trusted setup ceremony
- [ ] USYC yield routing for idle provider revenue
- [ ] TEE-based buyer agent (Phala / Marlin / Oasis Sapphire)
- [ ] Cross-chain execution (Circle CCTP)
- [ ] Slashing governance (replace `onlyOwner` slash)

See [BLOCKERS.md](BLOCKERS.md) for the prioritized work queue.

## Contributing

1. Fork, branch from `main`.
2. `bash scripts/setup.sh` to install all deps.
3. Add tests for your change; the CI checks contracts, backend, and agents.
4. Open a PR — the CI must be green before review.

Style:

- Solidity: `solidity@0.8.24`, optimizer `200 runs`, `SafeERC20` everywhere USDC moves.
- Python: `ruff` defaults; tests in `tests/` per subtree.
- TS: existing inline styles + Tailwind utility classes.

## License

MIT — see [LICENSE](LICENSE).
