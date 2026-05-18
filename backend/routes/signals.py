from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel, Field
from datetime import datetime
import os
import re

from ..models import EncryptedSignal, SignalOutcome, Subscription

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HEX_RE = re.compile(r"^(0x)?[0-9a-fA-F]+$")
MAX_ENCRYPTED_PAYLOAD = 16 * 1024  # 16 KiB hard cap on relay payload size


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


@router.post("/relay")
def relay_signal(req: RelayRequest, session: Session = Depends(get_session)):
    """Provider agent posts an encrypted signal destined for a buyer agent."""
    provider = _checksum(req.provider)
    buyer = _checksum(req.buyer)
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
def get_pending_signals(buyer_address: str, session: Session = Depends(get_session)):
    """Buyer agent polls for undelivered encrypted signals."""
    buyer = _checksum(buyer_address)
    signals = session.exec(
        select(EncryptedSignal).where(
            EncryptedSignal.buyer_address == buyer,
            EncryptedSignal.delivered == False,
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
        sig.delivered = True
        session.add(sig)
    session.commit()
    return result


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
