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

- [What is zkRoute?](#what-is-zkroute)
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

## What is zkRoute?

Quant traders with real edge have no good way to sell it. Selling a signal means
giving it away — the buyer reverse-engineers it, replicates it, and the edge
dies. Buyers, conversely, can't verify whether a provider is legit; track
records are screenshots and self-reported win rates.

zkRoute fixes both sides:

- **Providers** publish track records as Groth16 proofs over a commit-reveal
  log on Arc. The strategy stays private; the performance is mathematically
  verified.
- **Buyers** subscribe and their **autonomous agent** receives, decrypts, and
  executes the signals inside risk bounds the human sets. The human never sees
  the raw signal — only the resulting positions and PnL.
- **Settlement** runs on Arc with USDC nanopayments via x402, costing
  fractions of a cent per signal.

The novel claim: **you don't sell the signal, you sell execution of the signal
by the buyer's own agent.** Reverse-engineering becomes orders of magnitude
harder than reading "BUY ETH at $3,420 when RSI < 30" in a Telegram group.

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
| **Arc (USDC L2)** | `ProviderRegistry`, `CommitReveal`, `SignalMarket`, `Verifier` |
| **Backend (FastAPI)** | Encrypted-signal relay bus, marketplace listings, position tracking |
| **Agents (Python)** | Autonomous provider + buyer loops; NaCl encryption; oracle reads |
| **Frontend (Next.js)** | Marketplace browser, subscribe modal, portfolio dashboard, on-chain wagmi calls |
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

## Quickstart

Requires: **Node ≥ 18**, **Python 3.11**, **jq**. Optional: **circom 2.1.6**, **snarkjs**.

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

For the production walkthrough see [DEPLOYMENT.md](DEPLOYMENT.md).

## Arc testnet deployment

The single source of truth for deployed addresses is
[deployments/arc-testnet.json](deployments/arc-testnet.json). Every other doc
references that file. To export the addresses as `.env` lines:

```bash
eval "$(scripts/load_addresses.sh)"      # into current shell
scripts/load_addresses.sh >> .env        # into your .env file
```

### Current Arc testnet contracts

> The table below is sourced from `deployments/arc-testnet.json`. The placeholder
> zero-addresses will be replaced after the first real deployment. Run
> `scripts/load_addresses.sh` after editing the JSON file to propagate.

| Contract            | Address                                      | Source                                         |
|---------------------|----------------------------------------------|------------------------------------------------|
| USDC                | `0x0000…0000` *(set after deploy)*           | [`SignalMarket.sol`](contracts/contracts/SignalMarket.sol) |
| ProviderRegistry    | `0x0000…0000` *(set after deploy)*           | [`ProviderRegistry.sol`](contracts/contracts/ProviderRegistry.sol) |
| CommitReveal        | `0x0000…0000` *(set after deploy)*           | [`CommitReveal.sol`](contracts/contracts/CommitReveal.sol) |
| Verifier            | `0x0000…0000` *(STUB until trusted setup)*   | [`Verifier.sol`](contracts/contracts/Verifier.sol) |
| SignalMarket        | `0x0000…0000` *(set after deploy)*           | [`SignalMarket.sol`](contracts/contracts/SignalMarket.sol) |

### Network parameters

| Field             | Value (see `arc-testnet.json` for the live value) |
|-------------------|---------------------------------------------------|
| Chain ID          | `421614` *(verify against Circle docs)*            |
| RPC URL           | `https://rpc.arc.network`                          |
| Block explorer    | `https://explorer.arc.network`                     |
| Native gas token  | USDC (via Circle Paymaster)                        |
| Faucet            | `https://faucet.arc.network`                       |

## Subsystem docs

Each subtree has its own README with full detail on architecture, env vars,
test commands, and gotchas:

- **[contracts/README.md](contracts/README.md)** — every contract function, event,
  modifier, and storage slot; Hardhat test layout; deploy ordering.
- **[circuits/README.md](circuits/README.md)** — Poseidon hashing, input layout,
  trusted setup, proof generation, verifier swap procedure.
- **[backend/README.md](backend/README.md)** — every endpoint with request/response
  schema, DB schema, in-memory test fixtures, production hardening notes.
- **[agents/README.md](agents/README.md)** — provider + buyer loops, NaCl box
  encryption, risk-bounds enforcement, Pyth oracle integration, Circle Wallet
  trade execution.
- **[frontend/README.md](frontend/README.md)** — page routes, wagmi hooks,
  on-chain integration points, design system tokens.
- **[scripts/README.md](scripts/README.md)** — every helper script in detail.

## Security model

A short summary of what the system guarantees and what it doesn't.

### Guarantees

1. **Track record is verifiable.** A submitted Groth16 proof confirms that, for
   the set of commitments rolled into `commitmentRoot`, the claimed
   win-rate/return statistics are correct. No screenshots, no self-reports.
2. **Commitments are timestamped.** Providers must commit each signal hash
   *before* the market moves; reveals later have to match the preimage.
   Backdating is impossible.
3. **Stake is bonded.** A provider has 100 USDC at risk; the owner (eventually
   a multisig) can slash for fraud.
4. **Buyer never sees the signal.** The signal is end-to-end encrypted to the
   buyer agent's NaCl public key. Only the agent's private key (held in a
   programmable wallet) can decrypt.
5. **Agent operates inside hard limits.** The buyer pre-configures max position,
   leverage, daily VaR, allowed assets, and a kill switch. The contract enforces
   the upper bounds (`MAX_POSITION_BPS=50%`, `MAX_LEVERAGE_BPS=10x`,
   `MAX_DAILY_VAR_BPS=20%`).
6. **Funds are partitioned.** The on-chain treasury balance, provider revenue,
   and buyer floats are tracked separately. `withdrawFees` only withdraws
   protocol-fee accruals; buyer floats and provider revenue are never sweepable
   by the owner.

### Out-of-scope (today)

- **The buyer's machine is trusted.** A motivated buyer could read decrypted
  signals from their own agent's memory. Future work: TEE-based buyer agents
  (signals decrypted inside an enclave, never exposed to the host).
- **Pattern-matching across long histories.** A buyer can in principle reverse-
  engineer a strategy by observing many trades. Provider head-start (~5 min)
  reduces the value of doing so, but doesn't eliminate it.
- **Backend availability.** The signal relay is a single FastAPI instance with
  SQLite by default. Production should use Postgres + Redis/NATS for
  durability.
- **Verifier swap requires manual action.** The shipped `Verifier.sol` is a
  permissive stub. Until the real Groth16 verifier is deployed and the
  `SignalMarket.setVerifier(addr)` owner call is made, proofs are not actually
  enforced. See [circuits/README.md](circuits/README.md).

### Reporting vulnerabilities

Please email `security@zkroute.example` (replace with your real channel) with
encrypted disclosure. Do not open public issues for security bugs.

## Roadmap

- [x] MVP contracts (registry, commit-reveal, market)
- [x] Encrypted relay (NaCl box, end-to-end agent-to-agent)
- [x] Risk-bound buyer agent
- [x] Groth16 circuit + verifier swap path
- [x] Production-grade contract hardening (reentrancy, pausable, treasury split)
- [x] CI: contract tests + backend pytest + agent pytest + Next.js build
- [ ] Real trusted setup ceremony (multi-party)
- [ ] x402 facilitator integration tests
- [ ] USYC yield routing for idle provider revenue
- [ ] TEE-based buyer agent (Phala / Marlin / Oasis Sapphire)
- [ ] Cross-chain execution (Circle CCTP)
- [ ] Slashing governance (replace `onlyOwner` slash)

## Contributing

1. Fork, branch from `main`.
2. `bash scripts/setup.sh` to install all deps.
3. Add tests for your change; the CI checks contracts, backend, and agents.
4. Open a PR — the CI must be green before review.

Style:

- Solidity: `solidity@0.8.24`, optimizer `200 runs`, `SafeERC20` everywhere
  USDC moves.
- Python: `ruff` defaults; tests in `tests/` per subtree.
- TS: existing inline styles + Tailwind utility classes; no Tailwind layer
  reshuffling without discussion.

## License

MIT — see [LICENSE](LICENSE).
