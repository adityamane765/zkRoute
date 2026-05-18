# backend/

FastAPI server. Two responsibilities:

1. **Signal relay bus.** Provider agents POST encrypted signals; buyer agents
   poll for them. Encryption is end-to-end (NaCl box); the backend can't read
   payloads.
2. **Marketplace data layer.** Provider listings, buyer subscriptions, position
   tracking, displayed PnL.

The backend is **not** authoritative for funds. All money flows through Arc
contracts ([`contracts/`](../contracts/)). The backend exists so the UI doesn't
have to scrape on-chain events for every render.

## Stack

| Layer | Library |
|-------|---------|
| Web framework | [FastAPI](https://fastapi.tiangolo.com/) |
| ORM | [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy + Pydantic) |
| DB (dev) | SQLite |
| DB (prod) | Postgres (set `DATABASE_URL=postgresql+psycopg://...`) |
| Auth | EIP-191 `personal_sign` signature verification |
| Tests | pytest + httpx TestClient |

## Project layout

```
backend/
├── README.md
├── .gitignore
├── pytest.ini
├── requirements.txt
├── main.py             # app factory, router mounting, DB init
├── models.py           # SQLModel tables
├── routes/
│   ├── auth.py         # POST /auth/verify
│   ├── providers.py    # GET/POST /providers/*
│   ├── buyers.py       # GET/POST /buyer/*
│   └── signals.py      # GET/POST /signals/*
└── tests/
    ├── conftest.py     # in-memory SQLite per-test fixture
    ├── test_auth.py
    ├── test_providers.py
    ├── test_buyer_flow.py
    └── test_signals.py
```

## Endpoints

### Providers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/providers/register` | Mirror of on-chain `ProviderRegistry.register`. Body: `{ address, name, description, frequency, agent_public_key }`. Frequency is one of `HFT \| Intraday \| MediumFrequency \| Swing \| Macro`. |
| `GET`  | `/providers/` | List all active providers. |
| `GET`  | `/providers/{address}` | Single provider, including current displayed stats. |
| `GET`  | `/providers/{address}/subscribers` | Active subscriptions for this provider, used by the provider agent to encrypt to each buyer's pubkey. |
| `PATCH`| `/providers/{address}/stats` | Update displayed stats. **Requires an EIP-191 signature** of `zkRoute stats: {win_rate_bps}|{total_return_bps}|{total_signals}|{last_proof_block}` from the provider's wallet. Stale `last_proof_block` (less than the previously accepted) is rejected. |

### Buyers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/buyer/subscribe` | Body: `{ provider_address, buyer_address, buyer_agent_pubkey, max_position_bps?, max_leverage_bps?, daily_var_bps? }`. Bounds are clamped: max 50% position, 1x–10x leverage, max 20% daily VaR (matching the contract). |
| `POST` | `/buyer/positions` | Buyer agent records a newly opened position. Rejected unless the (buyer, provider) subscription is active and no position exists yet for `signal_id`. |
| `PATCH`| `/buyer/positions/{signal_id}` | Updates `current_price` and `pnl_bps` for live monitoring. |
| `GET`  | `/buyer/positions/{buyer_address}` | All positions for one buyer. |
| `POST` | `/buyer/rejections` | Records that the agent rejected a signal (kill switch, asset not allowed, etc.) — useful for audit. |
| `GET`  | `/buyer/dashboard/{buyer_address}` | Aggregate: total PnL bps, open count, position list. The shape the [`/buyer`](../frontend/app/buyer/page.tsx) page consumes. |

### Signals

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/signals/relay` | Provider agent posts an encrypted signal. Body: `{ provider, buyer, provider_pubkey, signal_id, encrypted_signal }`. The relay enforces that an active subscription exists and dedupes by `(provider, buyer, signal_id)`. |
| `GET`  | `/signals/pending/{buyer_address}` | Buyer agent polls. Returned signals are marked `delivered=True` in the same transaction. |
| `POST` | `/signals/outcome` | Provider agent records a signal outcome after market resolution. Idempotent per `signal_id`. |
| `GET`  | `/signals/{signal_id}/outcome` | Read-only. |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/verify` | Verifies an EIP-191 signature of `zkRoute authentication nonce: {nonce}`. Used by the frontend to bind a session to a wallet without storing private keys. |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Returns `{ "status": "ok" }`. |

## Data model

```sql
Provider(address PK, name, description, frequency, agent_public_key,
         registered_at, active, win_rate_bps?, total_return_bps?,
         total_signals?, last_proof_block?)

Subscription(id PK, provider_address, buyer_address, buyer_agent_pubkey,
             max_position_bps, max_leverage_bps, daily_var_bps,
             active, subscribed_at)

EncryptedSignal(id PK, signal_id, provider_address, buyer_address,
                provider_pubkey, encrypted_payload, created_at, delivered)

SignalOutcome(id PK, signal_id UNIQUE, provider_address, outcome,
              return_bps, exit_price, revealed_at)

BuyerPosition(id PK, signal_id, buyer_address, provider_address, asset,
              direction, size_pct, entry_price, current_price?,
              pnl_bps?, circle_tx_id?, open_time, closed_time?)

Rejection(id PK, signal_id, buyer_address, provider_address,
          reason, rejected_at)
```

All address fields are stored **lowercased**. Routes normalize before lookup.

## Hardening

This isn't a public-API audit, but the routes apply:

- Address format validation (`^0x[0-9a-fA-F]{40}$`)
- Hex-pubkey validation (exactly 32 bytes / 64 hex chars)
- Pydantic `Field` bounds on numeric inputs (sizes, prices, bps)
- Dedup on relayed signal IDs
- EIP-191 signature requirement on stats updates
- 16 KiB cap on encrypted signal payloads
- CORS allowed `*` for dev (tighten in production — see hardening section below)

## Running

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Server starts at `http://localhost:8000`. OpenAPI docs at `/docs`, ReDoc at
`/redoc`.

## Environment

Reads from `.env` at repo root (or shell):

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./zkroute.db` | SQLModel connection string |
| `API_SECRET_KEY` | — | Reserved for future JWT/session signing |
| `BACKEND_URL` | `http://localhost:8000` | Used by agents to reach the backend |

## Testing

```bash
cd backend
pytest                    # uses in-memory SQLite per test
```

The fixture in [`tests/conftest.py`](tests/conftest.py) patches every route
module's engine to use a shared in-memory engine via `StaticPool`, so each test
sees a fresh DB. Tests include:

| File | What it asserts |
|------|------------------|
| `test_auth.py` | EIP-191 round trip; rejection of wrong signers |
| `test_providers.py` | Registration validation, signature-protected stats updates, monotonic block guard |
| `test_buyer_flow.py` | Subscribe, position dedup, dashboard aggregation |
| `test_signals.py` | Relay requires subscription, dedup, payload hex validation |

CI runs these on every push.

## Production hardening (from MVP → real money)

The current backend is acceptable for an MVP/demo. Before exposing real funds:

1. **Postgres.** SQLite locks the whole DB on writes; swap to Postgres via
   `DATABASE_URL=postgresql+psycopg://user:pass@host/db`. SQLModel handles the
   rest.
2. **Real auth on writes.** Today the relay endpoint accepts any caller as long
   as the (provider, buyer) subscription exists. Add an `Authorization: Bearer
   <signed-nonce>` middleware that checks `msg.sender == provider`. Same for
   `/buyer/positions`.
3. **Rate limiting.** Add Redis-backed limits (e.g. `slowapi`). At least:
   - 60 req/min for `GET /signals/pending`
   - 10 req/min for `POST /signals/relay`
   - 1 req/sec for `PATCH /providers/{}/stats`
4. **HTTPS + tightened CORS.** Replace `allow_origins=["*"]` with your
   marketplace's actual origin list. Run behind Caddy/nginx with HTTPS.
5. **Durable queue for relay.** Single-FastAPI-instance + SQLite means a
   crash before the buyer polls can drop unread signals. Move
   `EncryptedSignal` writes to NATS/Redis Streams; persist a copy to Postgres
   for audit.
6. **Observability.** Add structured logging (JSON), OpenTelemetry traces, and
   alerts on:
   - relay → pending latency p99
   - stats update signature failures
   - subscription count per provider

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Already registered` on register | Address already has `active=true` | Use a different wallet or unregister via the on-chain `deactivate()` call |
| `provider not active` on subscribe | Backend has no record of this provider | Confirm `/providers/` lists them; if not, the provider may have skipped the backend mirror |
| `signal already relayed` (409) | Provider re-POSTed the same `signal_id` | Generate a new ID; the contract also enforces single-commit per `signalId` |
| Pending signals always empty | Backend marked them delivered on a previous poll | Inspect `EncryptedSignal.delivered` directly; relay reflects "at-most-once" semantics for replay safety |
