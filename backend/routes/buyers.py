from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, create_engine
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import os

from ..models import BuyerPosition, Rejection, Subscription

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session


class PositionOpenRequest(BaseModel):
    buyer: str
    signal_id: str
    provider: str
    asset: str
    direction: int
    size_pct: float
    entry_price: float
    circle_tx_id: Optional[str] = None
    open_time: float


class PositionUpdateRequest(BaseModel):
    current_price: float
    pnl_bps: int


class RejectionRequest(BaseModel):
    buyer: str
    signal_id: str
    provider: str
    reason: str


class SubscribeRequest(BaseModel):
    provider_address: str
    buyer_address: str
    buyer_agent_pubkey: str
    max_position_bps: int = 500     # 5%
    max_leverage_bps: int = 10000   # 1x
    daily_var_bps: int = 300        # 3%


@router.post("/subscribe")
def subscribe(req: SubscribeRequest, session: Session = Depends(get_session)):
    existing = session.exec(
        select(Subscription).where(
            Subscription.provider_address == req.provider_address,
            Subscription.buyer_address == req.buyer_address,
            Subscription.active == True,
        )
    ).first()
    if existing:
        raise HTTPException(400, "Already subscribed")
    sub = Subscription(
        provider_address=req.provider_address,
        buyer_address=req.buyer_address,
        buyer_agent_pubkey=req.buyer_agent_pubkey,
        max_position_bps=req.max_position_bps,
        max_leverage_bps=req.max_leverage_bps,
        daily_var_bps=req.daily_var_bps,
    )
    session.add(sub)
    session.commit()
    return {"status": "subscribed"}


@router.post("/positions")
def open_position(req: PositionOpenRequest, session: Session = Depends(get_session)):
    pos = BuyerPosition(
        signal_id=req.signal_id,
        buyer_address=req.buyer,
        provider_address=req.provider,
        asset=req.asset,
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
    positions = session.exec(
        select(BuyerPosition).where(BuyerPosition.buyer_address == buyer_address)
    ).all()
    return positions


@router.post("/rejections")
def record_rejection(req: RejectionRequest, session: Session = Depends(get_session)):
    rejection = Rejection(
        signal_id=req.signal_id,
        buyer_address=req.buyer,
        provider_address=req.provider,
        reason=req.reason,
    )
    session.add(rejection)
    session.commit()
    return {"status": "recorded"}


@router.get("/dashboard/{buyer_address}")
def get_dashboard(buyer_address: str, session: Session = Depends(get_session)):
    """Returns buyer dashboard data — positions and PnL, never signal content."""
    positions = session.exec(
        select(BuyerPosition).where(BuyerPosition.buyer_address == buyer_address)
    ).all()
    total_pnl_bps = sum(p.pnl_bps or 0 for p in positions)
    open_count = sum(1 for p in positions if p.closed_time is None)
    return {
        "buyer": buyer_address,
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
