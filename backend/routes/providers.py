from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel
from typing import Optional
import os

from ..models import Provider, Subscription

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session


class ProviderRegisterRequest(BaseModel):
    address: str
    name: str
    description: str
    frequency: str
    agent_public_key: str


class StatsUpdate(BaseModel):
    win_rate_bps: int
    total_return_bps: int
    total_signals: int
    last_proof_block: int


@router.post("/register")
def register_provider(req: ProviderRegisterRequest, session: Session = Depends(get_session)):
    existing = session.get(Provider, req.address)
    if existing and existing.active:
        raise HTTPException(400, "Already registered")
    provider = Provider(
        address=req.address,
        name=req.name,
        description=req.description,
        frequency=req.frequency,
        agent_public_key=req.agent_public_key,
    )
    session.add(provider)
    session.commit()
    return {"status": "registered", "address": req.address}


@router.get("/")
def list_providers(session: Session = Depends(get_session)):
    providers = session.exec(select(Provider).where(Provider.active == True)).all()
    return providers


@router.get("/{address}")
def get_provider(address: str, session: Session = Depends(get_session)):
    provider = session.get(Provider, address)
    if not provider:
        raise HTTPException(404, "Provider not found")
    return provider


@router.get("/{address}/subscribers")
def get_subscribers(address: str, session: Session = Depends(get_session)):
    subs = session.exec(
        select(Subscription).where(
            Subscription.provider_address == address,
            Subscription.active == True,
        )
    ).all()
    return [
        {"buyerAddress": s.buyer_address, "buyerAgentPubKey": s.buyer_agent_pubkey}
        for s in subs
    ]


@router.patch("/{address}/stats")
def update_stats(address: str, stats: StatsUpdate, session: Session = Depends(get_session)):
    provider = session.get(Provider, address)
    if not provider:
        raise HTTPException(404, "Provider not found")
    provider.win_rate_bps = stats.win_rate_bps
    provider.total_return_bps = stats.total_return_bps
    provider.total_signals = stats.total_signals
    provider.last_proof_block = stats.last_proof_block
    session.add(provider)
    session.commit()
    return {"status": "updated"}
