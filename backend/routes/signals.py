from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel
from datetime import datetime
import os

from ..models import EncryptedSignal, SignalOutcome, Subscription

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session


class RelayRequest(BaseModel):
    provider: str
    buyer: str
    provider_pubkey: str
    signal_id: str
    encrypted_signal: str


class OutcomeRequest(BaseModel):
    signal_id: str
    provider: str
    outcome: bool
    return_bps: int
    exit_price: float


@router.post("/relay")
def relay_signal(req: RelayRequest, session: Session = Depends(get_session)):
    """Provider agent posts an encrypted signal destined for a buyer agent."""
    sub = session.exec(
        select(Subscription).where(
            Subscription.provider_address == req.provider,
            Subscription.buyer_address == req.buyer,
            Subscription.active == True,
        )
    ).first()
    if not sub:
        raise HTTPException(403, "No active subscription")

    signal = EncryptedSignal(
        signal_id=req.signal_id,
        provider_address=req.provider,
        buyer_address=req.buyer,
        provider_pubkey=req.provider_pubkey,
        encrypted_payload=req.encrypted_signal,
    )
    session.add(signal)
    session.commit()
    return {"status": "relayed"}


@router.get("/pending/{buyer_address}")
def get_pending_signals(buyer_address: str, session: Session = Depends(get_session)):
    """Buyer agent polls for undelivered encrypted signals."""
    signals = session.exec(
        select(EncryptedSignal).where(
            EncryptedSignal.buyer_address == buyer_address,
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
        provider_address=req.provider,
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
