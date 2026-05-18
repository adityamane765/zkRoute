# scripts/

Operational scripts. None are required to run zkRoute, but they make the dev
loop and deploys faster.

| Script | Purpose |
|--------|---------|
| [`setup.sh`](setup.sh) | One-shot install of every subtree's dependencies (Arc CLI, agents, backend, contracts, circuits, frontend). |
| [`load_addresses.sh`](load_addresses.sh) | Emits `.env`-format lines from [`deployments/arc-testnet.json`](../deployments/arc-testnet.json). Use with `eval` to export into the current shell or `>>` to append to `.env`. |
| [`demo_seed.py`](demo_seed.py) | Seeds the backend with three fake providers + verified stats so the marketplace looks alive in a demo video. **Does not touch on-chain state.** |

## setup.sh

```bash
bash scripts/setup.sh
```

What it does (idempotent):

1. Installs the Arc CLI via `uv` (or `pip` fallback).
2. `pip install -e ".[dev]"` in `agents/`.
3. `pip install -r requirements.txt` in `backend/`.
4. `npm install` in `contracts/`.
5. `npm install` in `circuits/`.
6. `npm install` in `frontend/`.
7. Copies `.env.example` → `.env` if missing.

Failure on any step aborts (`set -e`).

## load_addresses.sh

```bash
# emit to stdout, paste into .env manually
scripts/load_addresses.sh

# export into current shell (one session only)
eval "$(scripts/load_addresses.sh)"

# append to .env
scripts/load_addresses.sh >> .env
```

Requires `jq`. Output covers every `*_ADDRESS` and `NEXT_PUBLIC_*` variable
the codebase reads.

Update flow after a new deploy:

```bash
# 1. Deploy
cd contracts && npm run deploy:arc

# 2. Paste the printed addresses into deployments/arc-testnet.json

# 3. Push them everywhere
cd ..
scripts/load_addresses.sh > .env.tmp
# review .env.tmp, then merge into the real .env
```

## demo_seed.py

```bash
python scripts/demo_seed.py
```

Pre-registers three placeholder providers (`ETH Momentum Alpha`,
`BTC Swing Desk`, `Multi-Asset Intraday`) with non-zero ZK stats so the
marketplace page renders something useful in a video demo.

Pure backend operation; no on-chain calls. Run with the backend already up at
`localhost:8000`.

## Roadmap

Future scripts to add when the need surfaces:

- `deploy_verifier.js` — single-purpose Hardhat task that deploys the freshly
  generated `Verifier.sol` and emits a `setVerifier` call template.
- `slash.py` — owner-side helper to slash a fraudulent provider given a
  governance vote ID.
- `treasury_sweep.py` — periodic `withdrawFees` to the treasury multisig.
- `e2e_demo.py` — orchestrates a full provider → buyer → reveal loop on a
  local Hardhat node for CI.
