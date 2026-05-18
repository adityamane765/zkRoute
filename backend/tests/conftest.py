"""
Test fixtures: in-process FastAPI client backed by an in-memory SQLite DB.
Patches every route module's engine so they share the same connection.
"""

import os
import pytest

# Important: set DATABASE_URL before importing the app so all engines pick it up.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("API_SECRET_KEY", "test-secret")

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import create_engine, Session, SQLModel

from backend import main as backend_main
from backend.routes import providers as providers_route
from backend.routes import buyers as buyers_route
from backend.routes import signals as signals_route


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def client(monkeypatch, engine):
    # Make every route module use the in-memory engine.
    for mod in (backend_main, providers_route, buyers_route, signals_route):
        monkeypatch.setattr(mod, "engine", engine, raising=False)

    def _session():
        with Session(engine) as s:
            yield s

    backend_main.app.dependency_overrides[providers_route.get_session] = _session
    backend_main.app.dependency_overrides[buyers_route.get_session] = _session
    backend_main.app.dependency_overrides[signals_route.get_session] = _session

    with TestClient(backend_main.app) as c:
        yield c

    backend_main.app.dependency_overrides.clear()
