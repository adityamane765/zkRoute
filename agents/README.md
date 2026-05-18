# agents/

Python autonomous agents — the heart of zkRoute. Two daemons:

- **Provider agent** ([`provider/agent.py`](provider/agent.py)) — generates
  signals, commits hashes on Arc, encrypts to each buyer, posts to the relay.
- **Buyer agent** ([`buyer/agent.py`](buyer/agent.py)) — polls the relay,
  decrypts, enforces risk bounds, executes via Circle Wallet, reports PnL.

Both agents are stateless except for caches; restarting them is safe.

## Project layout

```
agents/
├── README.md
├── .gitignore
├── pyproject.toml
├── pytest.ini
├── provider/
│   ├── __init__.py
│   └── agent.py            # provider main loop
├── buyer/
│   ├── __init__.py
│   └── agent.py            # buyer main loop
├── shared/
│   ├── __init__.py
│   ├── config.py           # env loading
│   ├── chain.py            # Web3 contract wrappers
│   ├── crypto.py           # NaCl box + commitment hash
│   ├── oracle.py           # Pyth Hermes integration
│   ├── circle_wallets.py   # Circle Programmable Wallets
│   ├── x402.py             # x402 nanopayment client/server
│   └── risk.py             # pure risk-bounds evaluator (unit-testable)
└── tests/
    ├── test_crypto.py
    └── test_risk.py
```

## Provider agent

### Loop

```
┌────────────────────────────────────────────────────────────────┐
│ every SIGNAL_INTERVAL_SECONDS (default 14400 = 4h):            │
│   for asset in [ETH, BTC]:                                     │
│     1. generate_signal(asset)              # Claude or quant model
│     2. compute_commitment_hash             # keccak(id|dir|asset|salt)
│     3. CommitReveal.commit(...)            # on-chain                
│     4. fetch subscribers from backend                          │
│     5. for each subscriber:                                    │
│          encrypt(signal_data, buyer_pubkey, provider_privkey)  │
│          POST /signals/relay                                    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ every 60s:                                                     │
│   for each pending signal older than REVEAL_DELAY (300s):      │
│     current_price = pyth.get_price(asset)                      │
│     outcome = (long & price↑) || (short & price↓)              │
│     return_bps = price_delta_bps  *  ±1                        │
│     CommitReveal.reveal(...)              # on-chain           │
│     POST /signals/outcome                                       │
│     append to signal_history (for ZK proof)                    │
└────────────────────────────────────────────────────────────────┘
```

### Signal generation

The MVP uses Claude (via `anthropic` SDK) as a placeholder for any quant model
that returns `{ direction: 0|1, confidence, rationale }`. In production,
replace `generate_signal` with your real strategy — the agent doesn't care
about the source.

### Provider head-start

`REVEAL_DELAY_SECONDS = 300` (5 minutes) gives the provider time to execute
their own position before subscribers receive the encrypted signal. This is
configurable and is the primary defense against subscribers front-running the
provider.

## Buyer agent

### Loop

```
┌──────────────────────────────────────────────────────────────────┐
│ every POLL_INTERVAL_SECONDS (default 30s):                       │
│   GET /signals/pending/{address}                                  │
│   for each pending signal:                                       │
│     decrypt with BUYER_AGENT_NACL_PRIVKEY                        │
│     risk.evaluate_signal(...)            # pure function          │
│       └─ asset allowed? kill switch? daily VaR left?             │
│     if accepted:                                                 │
│       entry_price = pyth.get_price(asset)                        │
│       size      = min(signal.size_hint_pct, max_position_pct)    │
│       execute via Circle Wallet                                  │
│       SignalMarket.processSignalPayment(...)   # on-chain        │
│       POST /buyer/positions                                       │
│     else:                                                         │
│       POST /buyer/rejections                                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ every 300s:                                                       │
│   for each open position:                                         │
│     compute live PnL                                              │
│     PATCH /buyer/positions/{signal_id}                            │
└──────────────────────────────────────────────────────────────────┘
```

### Risk-bounds enforcement

The buyer pre-configures hard limits at subscription time. The agent re-checks
on every signal using the pure function in [`shared/risk.py`](shared/risk.py):

```python
RiskBounds(
  max_position_pct=5.0,             # % of portfolio per trade
  max_leverage=1.0,                 # 1.0 = no leverage
  allowed_assets=frozenset({"ETH", "BTC"}),
  daily_var_pct=3.0,                # max % portfolio loss per day
  kill_switch=False,                # if True, reject all signals
)
```

Rejections produce a `reason` string posted to `/buyer/rejections` for audit:
`asset_not_allowed:<asset>`, `daily_var_limit_reached`, `kill_switch`,
`invalid_size`.

### Trade execution

`_execute_trade` calls Circle's Programmable Wallets API. If `CIRCLE_WALLET_ID`
is unset, the agent runs in **simulation mode** — useful for local
development and CI. Simulation logs the would-be trade and returns a fake tx
ID.

### Authorization

The agent has its own EVM address (`BUYER_AGENT_PRIVATE_KEY`). For
`SignalMarket.processSignalPayment` to succeed, the buyer must have
pre-authorized this address at subscribe time (the `agent` parameter on
`SignalMarket.subscribe`). The frontend modal asks for this address; see
[`frontend/components/SubscribeModal.tsx`](../frontend/components/SubscribeModal.tsx).

## Shared modules

### shared/crypto.py

NaCl box encryption (Curve25519 + XSalsa20-Poly1305). Each party has a 32-byte
secret key + 32-byte public key. Provider encrypts to buyer's pubkey using
provider's own privkey; only the buyer can decrypt.

```python
sk_hex, pk_hex = crypto.generate_keypair()
ciphertext_hex = crypto.encrypt_signal(payload, peer_pubkey_hex, my_privkey_hex)
plaintext      = crypto.decrypt_signal(ciphertext_hex, peer_pubkey_hex, my_privkey_hex)
```

Commitment hash matches Solidity's `keccak256(abi.encodePacked(...))`:

```python
hash_bytes = crypto.compute_commitment_hash(signal_id, direction, asset_id, salt)
```

### shared/oracle.py

Pyth Hermes REST API. Two functions:

```python
await oracle.get_price("ETH")                      # latest
await oracle.get_price_at_timestamp("ETH", 1735000000)   # for outcome verification
```

### shared/chain.py

Thin wrappers around the deployed contracts:

```python
w3 = get_web3()
account = get_account(PRIVATE_KEY)
cr = CommitRevealContract(w3, COMMIT_REVEAL_ADDRESS)
sm = SignalMarketContract(w3, SIGNAL_MARKET_ADDRESS)
```

ABIs are loaded from `contracts/artifacts/contracts/{Name}.sol/{Name}.json`,
so you must run `cd contracts && npm run compile` at least once before
starting an agent.

### shared/circle_wallets.py

Circle Programmable Wallets — async helpers:

```python
wallet = await create_wallet(user_id="buyer-123", blockchain="ARC")
balances = await get_wallet_balance(wallet_id)
tx_id = await transfer_usdc(wallet_id, dest, amount_usdc)
status = await get_transaction_status(tx_id)
```

### shared/x402.py

Client- and server-side helpers for x402 micropayments. Wraps the HTTP 402
→ pay → retry handshake. The client signs an EIP-712 `PaymentAuthorization`
typed-data structure; the server returns 402 with the required parameters when
payment is missing.

### shared/risk.py

Pure functions for risk evaluation, extracted so they're testable without
Web3/Circle/network:

```python
from agents.shared.risk import RiskBounds, RiskState, evaluate_signal, cap_size

bounds = RiskBounds(max_position_pct=5, max_leverage=1, allowed_assets=frozenset({"ETH"}), daily_var_pct=3)
state = RiskState(day_start=time.time())
reason = evaluate_signal(bounds, state, now, asset, size_hint_pct)
if reason is None:
    actual = cap_size(bounds, size_hint_pct)
```

## Running

### Provider

```bash
cd <repo root>
# one-time: compile contracts so ABIs exist
cd contracts && npm install && npm run compile && cd ..

# install agents
cd agents && pip install -e ".[dev]" && cd ..

# generate provider keys
python -c "from agents.shared.crypto import generate_keypair; sk, pk = generate_keypair(); print(f'PROVIDER_SIGNING_KEY={sk}\\nPROVIDER_AGENT_PUBLIC_KEY={pk}')"
# add output to .env

# generate provider EVM keypair if you don't have one
python -c "from eth_account import Account; a = Account.create(); print(f'PROVIDER_AGENT_PRIVATE_KEY={a.key.hex()}\\naddr={a.address}')"

# start
python -m agents.provider.agent
```

### Buyer

```bash
# generate buyer agent keys
python -c "from agents.shared.crypto import generate_keypair; sk, pk = generate_keypair(); print(f'BUYER_AGENT_NACL_PRIVKEY={sk}\\nBUYER_AGENT_PUBLIC_KEY={pk}')"
python -c "from eth_account import Account; a = Account.create(); print(f'BUYER_AGENT_PRIVATE_KEY={a.key.hex()}\\naddr={a.address}')"

# the EVM addr above is what you put in SubscribeModal as "Buyer agent EVM address"
# subscribe via the frontend so the on-chain subscription authorizes this agent

python -m agents.buyer.agent
```

## Environment

The agents read from `.env` at repo root. Required keys:

| Var | Used by | Purpose |
|-----|---------|---------|
| `ARC_RPC_URL`, `ARC_CHAIN_ID` | both | Web3 connection |
| `PROVIDER_REGISTRY_ADDRESS` | provider | Read provider state |
| `COMMIT_REVEAL_ADDRESS` | provider | Commit + reveal calls |
| `SIGNAL_MARKET_ADDRESS` | both | Payments + subscription reads |
| `PROVIDER_AGENT_PRIVATE_KEY` | provider | EVM signer for on-chain calls |
| `PROVIDER_SIGNING_KEY` | provider | NaCl box privkey for encrypting signals |
| `PROVIDER_AGENT_PUBLIC_KEY` | provider | NaCl box pubkey (corresponds to signing key) |
| `BUYER_AGENT_PRIVATE_KEY` | buyer | EVM signer; **must match** the agent address you pass at subscribe |
| `BUYER_AGENT_NACL_PRIVKEY` | buyer | NaCl privkey for decrypting signals |
| `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` | buyer | Programmable Wallets API |
| `CIRCLE_WALLET_ID` | buyer | (optional) — leave unset for simulation mode |
| `BACKEND_URL` | both | Relay/marketplace API |
| `PYTH_ENDPOINT` | both | Pyth Hermes REST base |
| `MAX_POSITION_PCT`, `MAX_LEVERAGE`, `ALLOWED_ASSETS`, `DAILY_VAR_PCT` | buyer | Risk bounds, overridable at runtime |

Plus the Anthropic key if you're using Claude for signal generation:
`ANTHROPIC_API_KEY=sk-ant-...`.

## Testing

```bash
cd agents
pytest                       # pure-function tests, no Web3/Circle needed
```

Tests cover:

- [`tests/test_crypto.py`](tests/test_crypto.py) — NaCl round-trip, commitment
  hash determinism, key generation
- [`tests/test_risk.py`](tests/test_risk.py) — every rejection branch, daily
  VaR reset, size clamping

The agent main loops are not unit-tested directly (they require Web3 + Pyth +
backend running). Use the e2e walkthrough in [DEPLOYMENT.md](../DEPLOYMENT.md)
for integration.

## Failure modes & recovery

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Backend down at relay time | Relay POST raises | Provider agent logs warning, signal is still committed on-chain. Re-relay manually after backend recovery (TODO: add idempotent re-relay endpoint). |
| Web3 RPC down | Commit raises | Signal is lost for this cycle. Next cycle continues. |
| NaCl decryption fails | Logged, signal skipped | Likely a key mismatch — verify the pubkey shown in `/providers/` matches the one the provider agent's `PROVIDER_SIGNING_KEY` derives. |
| Pyth unavailable | `oracle.get_price` raises | Buyer agent skips the trade; provider agent skips the reveal. |
| Circle wallet failure | Trade fails | Position is not opened; `processSignalPayment` is also skipped so the buyer isn't charged. |
| Risk bound trips | Rejection POSTed | Buyer can inspect via the dashboard; adjust bounds via `SignalMarket.updateRiskBounds`. |

## Logging

Each agent logs to stdout in the format:

```
2026-05-18 22:00:00,000 [PROVIDER] Committed ETH signal 0xabcd1234... tx=0xdead...
```

For production, pipe to a log aggregator and alert on `Decrypt failed` /
`Risk rejection` rates.

## Security checklist (per agent operator)

- [ ] Provider/buyer EVM keys are stored in a hardware wallet or a managed
      secret store, not in plain `.env`.
- [ ] Circle entity secret is encrypted at rest.
- [ ] Buyer agent runs on a machine the buyer controls (until TEE support
      lands).
- [ ] Provider's `signal_history` JSON file is treated as sensitive — it
      reveals individual trade outcomes that were intentionally hidden on
      chain.
- [ ] Pyth feed staleness is checked before trusting the price (TODO — add a
      `confidence * 10**expo / price < threshold` check).
