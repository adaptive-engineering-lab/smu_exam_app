"""
Shared pytest fixtures.

Uses an in-memory SQLite database so tests are fully isolated from
production. Supabase Auth is mocked — tests generate HS256 JWTs that
match the same format the backend expects from Supabase.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

# Set test secrets BEFORE importing app modules so pydantic_settings picks them up.
TEST_JWT_SECRET = "test-secret-32-chars-minimum-xxxx"
os.environ.setdefault("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.models.user import User

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

def make_token(user_id: str, role: str) -> str:
    """Generate a Supabase-format HS256 JWT for use in tests."""
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {
        "sub": user_id,
        "role": "authenticated",  # Supabase sets this for all logged-in users
        "app_metadata": {"role": role},
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


def insert_user(
    db_session,
    email: str,
    role: str,
    name: str | None = None,
    user_id: str | None = None,
) -> User:
    """Insert a user directly into the test DB, bypassing Supabase Admin API."""
    uid = user_id or str(uuid.uuid4())
    user = User(id=uid, email=email, name=name, role=role)
    db_session.add(user)
    db_session.flush()
    return user


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(db_session, email: str, role: str = "student") -> str:
    """Return a test JWT for an existing user (looked up by email)."""
    user = db_session.query(User).filter(User.email == email).first()
    assert user is not None, f"User {email} not found"
    return make_token(user.id, role)
