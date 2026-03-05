"""
Shared pytest fixtures.

Uses an in-memory SQLite database so tests are fully isolated from the
production PostgreSQL instance and from each other.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app

SQLITE_URL = "sqlite://"  # pure in-memory, discarded after the session


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture()
def db_session(engine):
    """Each test gets its own transaction that is rolled back on teardown."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    """TestClient with the DB dependency overridden to the test session."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── helpers ──────────────────────────────────────────────────────────────────

def register(client: TestClient, email: str, password: str = "pass1234", role: str = "student", name: str | None = None) -> dict:
    payload: dict = {"email": email, "password": password, "role": role}
    if name:
        payload["name"] = name
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def login(client: TestClient, email: str, password: str = "pass1234") -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
