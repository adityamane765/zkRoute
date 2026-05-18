from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
import os
import re

from ..models import BuyerPosition, Rejection, Subscription, Provider

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HEX64_RE = re.compile(r"^(0x)?[0-9a-fA-F]{64}$")

# Same hard caps as SignalMarket.sol — keep in sync.
MAX_POSITION_BPS = 5_000
MAX_LEVERAGE_BPS = 10 * 10_000
MAX_DAILY_VAR_BPS = 2_000


def get_session():
    with Session(engine) as session:
        yield session


def _checksum(addr: str) -> str:
    if not ADDRESS_RE.match(addr):
        raise HTTPException(400, "invalid address")
    return addr.lower()


class PositionOpenRequest(BaseModel):
    buyer: str
    signal_id: str
    provider: str
    asset: str = Field(min_length=1, max_length=12)
    direction: int = Field(ge=0, le=1)
    size_pct: float = Field(gt=0, le=100)
    entry_price: float = Field(gt=0)
    circle_tx_id: Optional[str] = None
    open_time: float


class PositionUpdateRequest(BaseModel):
    current_price: float = Field(gt=0)
    pnl_bps: int


class RejectionRequest(BaseModel):
    buyer: str
    signal_id: str
    provider: str
    reason: str = Field(min_length=1, max_length=200)


class SubscribeRequest(BaseModel):
    provider_address: str
    buyer_address: str
    buyer_agent_pubkey: str
    max_position_bps: int = Field(default=500,  ge=1, le=MAX_POSITION_BPS)   # 5%
    max_leverage_bps: int = Field(default=10000, ge=10_000, le=MAX_LEVERAGE_BPS)  # 1x..10x
    daily_var_bps: int    = Field(default=300,  ge=1, le=MAX_DAILY_VAR_BPS)   # 3%


@router.post("/subscribe")
def subscribe(req: SubscribeRequest, session: Session = Depends(get_session)):
    provider_addr = _checksum(req.provider_address)
    buyer_addr = _checksum(req.buyer_address)
    if not HEX64_RE.match(req.buyer_agent_pubkey):
        raise HTTPException(400, "buyer_agent_pubkey must be 32 bytes hex")
    provider = session.get(Provider, provider_addr)
    if not provider or not provider.active:
        raise HTTPException(404, "provider not active")
    existing = session.exec(
        select(Subscription).where(
            Subscription.provider_address == provider_addr,
            Subscription.buyer_address == buyer_addr,
            Subscription.active == True,
        )
    ).first()
    if existing:
        raise HTTPException(400, "Already subscribed")
    sub = Subscription(
        provider_address=provider_addr,
        buyer_address=buyer_addr,
        buyer_agent_pubkey=req.buyer_agent_pubkey.lower().removeprefix("0x"),
        max_position_bps=req.max_position_bps,
        max_leverage_bps=req.max_leverage_bps,
        daily_var_bps=req.daily_var_bps,
    )
    session.add(sub)
    session.commit()
    return {"status": "subscribed", "id": sub.id}


@router.post("/positions")
def open_position(req: PositionOpenRequest, session: Session = Depends(get_session)):
    buyer = _checksum(req.buyer)
    provider = _checksum(req.provider)
    sub = session.exec(
        select(Subscription).where(
            Subscription.buyer_address == buyer,
            Subscription.provider_address == provider,
            Subscription.active == True,
        )
    ).first()
    if not sub:
        raise HTTPException(403, "no active subscription")
    # Prevent duplicate positions for the same signal.
    if session.exec(
        select(BuyerPosition).where(BuyerPosition.signal_id == req.signal_id)
    ).first():
        raise HTTPException(400, "position already opened for signal")
    pos = BuyerPosition(
        signal_id=req.signal_id,
        buyer_address=buyer,
        provider_address=provider,
        asset=req.asset.upper(),
        direction=req.direction,
        size_pct=req.size_pct,
        entry_price=req.entry_price,
        circle_tx_id=req.circle_tx_id,
        open_time=datetime.utcfromtimestamp(req.open_time),
    )
    session.add(pos)
    session.commit()
    return {"status": "opened", "id": pos.id}


@router.patch("/positions/{signal_id}")
def update_position(
    signal_id: str,
    req: PositionUpdateRequest,
    session: Session = Depends(get_session),
):
    pos = session.exec(
        select(BuyerPosition).where(BuyerPosition.signal_id == signal_id)
    ).first()
    if not pos:
        raise HTTPException(404, "Position not found")
    pos.current_price = req.current_price
    pos.pnl_bps = req.pnl_bps
    session.add(pos)
    session.commit()
    return {"status": "updated"}


@router.get("/positions/{buyer_address}")
def get_positions(buyer_address: str, session: Session = Depends(get_session)):
    buyer = _checksum(buyer_address)
    positions = session.exec(
        select(BuyerPosition).where(BuyerPosition.buyer_address == buyer)
    ).all()
    return positions


@router.post("/rejections")
def record_rejection(req: RejectionRequest, session: Session = Depends(get_session)):
    rejection = Rejection(
        signal_id=req.signal_id,
        buyer_address=_checksum(req.buyer),
        provider_address=_checksum(req.provider),
        reason=req.reason,
    )
    session.add(rejection)
    session.commit()
    return {"status": "recorded"}


@router.get("/dashboard/{buyer_address}")
def get_dashboard(buyer_address: str, session: Session = Depends(get_session)):
    """Returns buyer dashboard data — positions and PnL, never signal content."""
    buyer = _checksum(buyer_address)
    positions = session.exec(
        select(BuyerPosition).where(BuyerPosition.buyer_address == buyer)
    ).all()
    total_pnl_bps = sum(p.pnl_bps or 0 for p in positions)
    open_count = sum(1 for p in positions if p.closed_time is None)
    return {
        "buyer": buyer,
        "open_positions": open_count,
        "total_positions": len(positions),
        "total_pnl_bps": total_pnl_bps,
        "positions": [
            {
                "asset": p.asset,
                "direction": "LONG" if p.direction == 1 else "SHORT",
                "size_pct": p.size_pct,
                "entry_price": p.entry_price,
                "current_price": p.current_price,
                "pnl_bps": p.pnl_bps,
                "open_time": p.open_time.isoformat(),
            }
            for p in positions
        ],
    }
