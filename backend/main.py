"""
zkRoute Backend API
Serves as the signal relay bus and marketplace data layer.
Agents never talk to each other directly — all relay goes through here.
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import SQLModel, create_engine, Session, select
from typing import Optional
import os

from .models import (
    Provider, EncryptedSignal, BuyerPosition, SignalOutcome,
    Subscription, Rejection,
)
from .routes import providers, signals, buyers, auth

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./zkroute.db")
engine = create_engine(DATABASE_URL, echo=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(title="zkRoute API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(providers.router, prefix="/providers", tags=["providers"])
app.include_router(signals.router, prefix="/signals", tags=["signals"])
app.include_router(buyers.router, prefix="/buyer", tags=["buyer"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
def health():
    return {"status": "ok"}
