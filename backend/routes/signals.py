from fastapi import APIRouter, HTTPException, Depends, Request
from sqlmodel import Session, select, create_engine, or_
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from slowapi import Limiter
from slowapi.util import get_remote_address
import os
import re

from ..models import EncryptedSignal, SignalOutcome, Subscription
from ..auth_dep import require_signer

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HEX_RE = re.compile(r"^(0x)?[0-9a-fA-F]+$")
MAX_ENCRYPTED_PAYLOAD = 16 * 1024  # 16 KiB hard cap on relay payload size

# At-least-once delivery semantics (BLOCKERS.md #15):
# - On GET /pending, return signals that have never been polled OR were polled
#   more than LEASE_SECONDS ago AND haven't been acked. The buyer agent calls
#   POST /signals/ack once it's safely processed each signal. A crashed buyer
#   gets the signals back after the lease expires.
LEASE_SECONDS = int(os.environ.get("RELAY_LEASE_SECONDS", "60"))


def get_session():
    with Session(engine) as session:
        yield session


def _checksum(addr: str) -> str:
    if not ADDRESS_RE.match(addr):
        raise HTTPException(400, "invalid address")
    return addr.lower()


class RelayRequest(BaseModel):
    provider: str
    buyer: str
    provider_pubkey: str
    signal_id: str
    encrypted_signal: str = Field(max_length=MAX_ENCRYPTED_PAYLOAD)


class OutcomeRequest(BaseModel):
    signal_id: str
    provider: str
    outcome: bool
    return_bps: int = Field(ge=-100_000, le=100_000)
    exit_price: float = Field(gt=0)


class AckRequest(BaseModel):
    buyer: str
    signal_ids: list[str] = Field(min_length=1, max_length=200)


@router.post("/relay")
@limiter.limit("20/minute")
def relay_signal(
    request: Request,
    req: RelayRequest,
    signer: str | None = Depends(require_signer()),
    session: Session = Depends(get_session),
):
    """Provider agent posts an encrypted signal destined for a buyer agent.

    When ZKROUTE_REQUIRE_AUTH=true, the request must include a valid signed
    nonce (see /auth/nonce) and the recovered signer must equal req.provider.
    """
    provider = _checksum(req.provider)
    buyer = _checksum(req.buyer)
    if signer is not None and signer != provider:
        raise HTTPException(403, "signer must equal request.provider")
    if not HEX_RE.match(req.provider_pubkey) or len(req.provider_pubkey.removeprefix("0x")) != 64:
        raise HTTPException(400, "provider_pubkey must be 32 bytes hex")
    if not HEX_RE.match(req.encrypted_signal):
        raise HTTPException(400, "encrypted_signal must be hex")

    sub = session.exec(
        select(Subscription).where(
            Subscription.provider_address == provider,
            Subscription.buyer_address == buyer,
            Subscription.active == True,
        )
    ).first()
    if not sub:
        raise HTTPException(403, "No active subscription")

    # Dedupe: a single signal_id can only be relayed once per (provider, buyer).
    duplicate = session.exec(
        select(EncryptedSignal).where(
            EncryptedSignal.signal_id == req.signal_id,
            EncryptedSignal.provider_address == provider,
            EncryptedSignal.buyer_address == buyer,
        )
    ).first()
    if duplicate:
        raise HTTPException(409, "signal already relayed")

    signal = EncryptedSignal(
        signal_id=req.signal_id,
        provider_address=provider,
        buyer_address=buyer,
        provider_pubkey=req.provider_pubkey.lower().removeprefix("0x"),
        encrypted_payload=req.encrypted_signal,
    )
    session.add(signal)
    session.commit()
    return {"status": "relayed"}


@router.get("/pending/{buyer_address}")
@limiter.limit("60/minute")
def get_pending_signals(request: Request, buyer_address: str, session: Session = Depends(get_session)):
    """Buyer agent polls for undelivered encrypted signals.

    Implements at-least-once delivery: a signal is returned again on the next
    poll if the buyer hasn't called /signals/ack within LEASE_SECONDS. This
    means buyer code MUST be idempotent on duplicate signal_ids — the
    `processed_signal_ids` set in agents/buyer/agent.py already handles this.
    """
    buyer = _checksum(buyer_address)
    now = datetime.utcnow()
    lease_cutoff = now - timedelta(seconds=LEASE_SECONDS)

    signals = session.exec(
        select(EncryptedSignal).where(
            EncryptedSignal.buyer_address == buyer,
            EncryptedSignal.acked_at == None,  # noqa: E711 (SQLAlchemy needs ==)
            or_(
                EncryptedSignal.last_polled_at == None,  # noqa: E711
                EncryptedSignal.last_polled_at <= lease_cutoff,
            ),
        )
    ).all()

    result = []
    for sig in signals:
        result.append({
            "signal_id": sig.signal_id,
            "provider": sig.provider_address,
            "provider_pubkey": sig.provider_pubkey,
            "encrypted_signal": sig.encrypted_payload,
        })
        sig.last_polled_at = now
        # Keep `delivered=True` for the legacy column too so old readers see it.
        sig.delivered = True
        session.add(sig)
    session.commit()
    return result


@router.post("/ack")
def ack_signals(req: AckRequest, session: Session = Depends(get_session)):
    """Buyer agent confirms it has processed these signal_ids — they will
    not be re-delivered. Idempotent: re-acking is a no-op."""
    buyer = _checksum(req.buyer)
    now = datetime.utcnow()
    acked = 0
    for sid in req.signal_ids:
        sig = session.exec(
            select(EncryptedSignal).where(
                EncryptedSignal.signal_id == sid,
                EncryptedSignal.buyer_address == buyer,
            )
        ).first()
        if sig and sig.acked_at is None:
            sig.acked_at = now
            session.add(sig)
            acked += 1
    session.commit()
    return {"acked": acked}


@router.post("/outcome")
def record_outcome(req: OutcomeRequest, session: Session = Depends(get_session)):
    """Provider agent reports outcome after market resolves."""
    existing = session.exec(
        select(SignalOutcome).where(SignalOutcome.signal_id == req.signal_id)
    ).first()
    if existing:
        raise HTTPException(400, "Outcome already recorded")
    outcome = SignalOutcome(
        signal_id=req.signal_id,
        provider_address=_checksum(req.provider),
        outcome=req.outcome,
        return_bps=req.return_bps,
        exit_price=req.exit_price,
    )
    session.add(outcome)
    session.commit()
    return {"status": "recorded"}


@router.get("/{signal_id}/outcome")
def get_outcome(signal_id: str, session: Session = Depends(get_session)):
    outcome = session.exec(
        select(SignalOutcome).where(SignalOutcome.signal_id == signal_id)
    ).first()
    if not outcome:
        raise HTTPException(404, "Outcome not found")
    return outcome
