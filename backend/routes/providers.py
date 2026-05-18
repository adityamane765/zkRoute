from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel, Field
from typing import Optional
import os
import re

from eth_account import Account
from eth_account.messages import encode_defunct

from ..models import Provider, Subscription

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HEX64_RE = re.compile(r"^(0x)?[0-9a-fA-F]{64}$")
VALID_FREQUENCIES = {"HFT", "Intraday", "MediumFrequency", "Swing", "Macro"}


def get_session():
    with Session(engine) as session:
        yield session


def _checksum(addr: str) -> str:
    if not ADDRESS_RE.match(addr):
        raise HTTPException(400, "invalid address")
    return addr.lower()


class ProviderRegisterRequest(BaseModel):
    address: str
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    frequency: str
    agent_public_key: str


class StatsUpdate(BaseModel):
    win_rate_bps: int = Field(ge=0, le=10_000)
    total_return_bps: int
    total_signals: int = Field(ge=0)
    last_proof_block: int = Field(ge=0)
    # EIP-191 signature of `zkRoute stats: {win_rate_bps}|{total_return_bps}|{total_signals}|{last_proof_block}`
    signature: str


@router.post("/register")
def register_provider(req: ProviderRegisterRequest, session: Session = Depends(get_session)):
    addr = _checksum(req.address)
    if req.frequency not in VALID_FREQUENCIES:
        raise HTTPException(400, "invalid frequency")
    if not HEX64_RE.match(req.agent_public_key):
        raise HTTPException(400, "agent_public_key must be 32 bytes hex")
    existing = session.get(Provider, addr)
    if existing and existing.active:
        raise HTTPException(400, "Already registered")
    provider = Provider(
        address=addr,
        name=req.name.strip(),
        description=req.description.strip(),
        frequency=req.frequency,
        agent_public_key=req.agent_public_key.lower().removeprefix("0x"),
    )
    session.add(provider)
    session.commit()
    return {"status": "registered", "address": addr}


@router.get("/")
def list_providers(session: Session = Depends(get_session)):
    providers = session.exec(select(Provider).where(Provider.active == True)).all()
    return providers


@router.get("/{address}")
def get_provider(address: str, session: Session = Depends(get_session)):
    addr = _checksum(address)
    provider = session.get(Provider, addr)
    if not provider:
        raise HTTPException(404, "Provider not found")
    return provider


@router.get("/{address}/subscribers")
def get_subscribers(address: str, session: Session = Depends(get_session)):
    addr = _checksum(address)
    subs = session.exec(
        select(Subscription).where(
            Subscription.provider_address == addr,
            Subscription.active == True,
        )
    ).all()
    return [
        {"buyerAddress": s.buyer_address, "buyerAgentPubKey": s.buyer_agent_pubkey}
        for s in subs
    ]


@router.patch("/{address}/stats")
def update_stats(address: str, stats: StatsUpdate, session: Session = Depends(get_session)):
    """
    Updates a provider's displayed stats. Must be signed by the provider's wallet:
       message = f"zkRoute stats: {win_rate_bps}|{total_return_bps}|{total_signals}|{last_proof_block}"
       signature = personal_sign(message)

    For production, the canonical source of stats should be the on-chain ZK proof.
    This endpoint exists for off-chain previews (e.g., between proof submissions).
    """
    addr = _checksum(address)
    provider = session.get(Provider, addr)
    if not provider:
        raise HTTPException(404, "Provider not found")

    message = (
        f"zkRoute stats: {stats.win_rate_bps}|{stats.total_return_bps}|"
        f"{stats.total_signals}|{stats.last_proof_block}"
    )
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=stats.signature)
    except Exception:
        raise HTTPException(401, "invalid signature")
    if recovered.lower() != addr.lower():
        raise HTTPException(401, "signature address mismatch")

    # Monotonic block guard — never accept a stats update older than the last accepted proof.
    if provider.last_proof_block is not None and stats.last_proof_block < provider.last_proof_block:
        raise HTTPException(400, "stale proof block")

    provider.win_rate_bps = stats.win_rate_bps
    provider.total_return_bps = stats.total_return_bps
    provider.total_signals = stats.total_signals
    provider.last_proof_block = stats.last_proof_block
    session.add(provider)
    session.commit()
    return {"status": "updated"}
