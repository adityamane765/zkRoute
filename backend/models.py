from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class Provider(SQLModel, table=True):
    address: str = Field(primary_key=True)
    name: str
    description: str
    frequency: str              # HFT | Intraday | MediumFrequency | Swing | Macro
    agent_public_key: str       # NaCl box pubkey hex (provider's signing key pubkey)
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    active: bool = True
    # ZK-verified stats (updated when provider submits proof)
    win_count: Optional[int] = None        # new winCount circuit output (slot 0 post-#3)
    win_rate_bps: Optional[int] = None     # derived display value (win_count*10000/total_signals)
    total_return_bps: Optional[int] = None
    total_signals: Optional[int] = None
    last_proof_block: Optional[int] = None


class Subscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    provider_address: str = Field(index=True)
    buyer_address: str = Field(index=True)
    buyer_agent_pubkey: str     # NaCl box pubkey hex (buyer agent's decryption key pubkey)
    max_position_bps: int
    max_leverage_bps: int
    daily_var_bps: int
    active: bool = True
    subscribed_at: datetime = Field(default_factory=datetime.utcnow)


class EncryptedSignal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    signal_id: str = Field(index=True)
    provider_address: str = Field(index=True)
    buyer_address: str = Field(index=True)
    provider_pubkey: str        # so buyer agent can decrypt
    encrypted_payload: str      # NaCl box ciphertext (hex)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # `delivered` is now derived from `acked_at`; kept for backwards-compat with
    # existing rows. New code paths should treat acked_at as the source of truth.
    delivered: bool = False
    # At-least-once delivery semantics (BLOCKERS.md #15):
    # - last_polled_at: when GET /pending last returned this row. Used to gate
    #   re-delivery via the LEASE_SECONDS window so a crashed buyer eventually
    #   gets the signal again.
    # - acked_at: when the buyer POSTed /signals/ack confirming it processed
    #   the row. Once set, the row is no longer returned by /pending.
    last_polled_at: Optional[datetime] = Field(default=None, index=True)
    acked_at: Optional[datetime] = Field(default=None, index=True)


class SignalOutcome(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    signal_id: str = Field(index=True, unique=True)
    provider_address: str
    outcome: bool               # True=win, False=loss
    return_bps: int
    exit_price: float
    revealed_at: datetime = Field(default_factory=datetime.utcnow)


class BuyerPosition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    signal_id: str = Field(index=True)
    buyer_address: str = Field(index=True)
    provider_address: str
    asset: str
    direction: int              # 1=long, 0=short
    size_pct: float
    entry_price: float
    current_price: Optional[float] = None
    pnl_bps: Optional[int] = None
    circle_tx_id: Optional[str] = None
    open_time: datetime
    closed_time: Optional[datetime] = None


class Rejection(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    signal_id: str
    buyer_address: str
    provider_address: str
    reason: str
    rejected_at: datetime = Field(default_factory=datetime.utcnow)
