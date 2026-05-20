"""
zkRoute Backend API
Serves as the signal relay bus and marketplace data layer.
Agents never talk to each other directly — all relay goes through here.

Production deployment:
  - DATABASE_URL=postgresql+psycopg://user:pass@host/db   # default sqlite for dev
  - ZKROUTE_REQUIRE_AUTH=true                             # forces signed nonces on relay writes
  - Rate limits via slowapi are active in all environments (BLOCKERS.md #13).
"""

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import SQLModel, create_engine, Session, select
from sqlalchemy import text
from typing import Optional
import os

# Rate limiting (BLOCKERS.md #13)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .models import (
    Provider, EncryptedSignal, BuyerPosition, SignalOutcome,
    Subscription, Rejection,
)
from .routes import providers, signals, buyers, auth, rpc

# Drop SQLite default for production by setting DATABASE_URL=postgresql+psycopg://...
# SQLModel + SQLAlchemy 2.x handles the dialect switch transparently.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")

# SQLite needs `check_same_thread=False` to work with FastAPI's threadpool.
# Postgres doesn't (and rejects the kwarg) — branch accordingly.
_engine_kwargs = {"echo": False}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **_engine_kwargs)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    # Additive migrations for columns added after initial deploy.
    # ALTER TABLE ADD COLUMN is idempotent via try/except on SQLite;
    # PostgreSQL raises DuplicateColumn which is also safe to swallow.
    _additive_migrations = [
        "ALTER TABLE provider ADD COLUMN win_count INTEGER",
    ]
    with engine.connect() as conn:
        for stmt in _additive_migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass
    yield


# Rate limiter keyed by client IP. Override key_func with a wallet-address-aware
# fn once auth is on (the recovered signer from auth_dep is a better key).
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

app = FastAPI(title="zkRoute API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    # Tighten in production by setting CORS_ORIGINS=https://app.example.com,...
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(providers.router, prefix="/providers", tags=["providers"])
app.include_router(signals.router, prefix="/signals", tags=["signals"])
app.include_router(buyers.router, prefix="/buyer", tags=["buyer"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(rpc.router, prefix="", tags=["rpc"])    # POST /rpc proxy


@app.get("/health")
def health():
    return {"status": "ok", "db": DATABASE_URL.split(":", 1)[0]}
