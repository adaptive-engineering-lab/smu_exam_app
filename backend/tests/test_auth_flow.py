"""
Tests for the auth flow with Supabase JWT verification.

Login/register via Supabase is mocked. We test that the backend
correctly reads the user from DB using the JWT sub claim.
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app
from app.models.user import User
from tests.conftest import auth, insert_user, make_token


@pytest.fixture()
def client_with_db(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c, db_session
    app.dependency_overrides.clear()


def test_me_returns_current_user(client_with_db):
    client, db = client_with_db
    user = insert_user(db, email="me@test.com", role="student", name="Test Student")
    token = make_token(user.id, "student")

    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "me@test.com"
    assert data["role"] == "student"
    assert data["id"] == user.id


def test_me_rejects_invalid_token(client_with_db):
    client, _ = client_with_db
    r = client.get("/auth/me", headers={"Authorization": "Bearer not.a.valid.jwt"})
    assert r.status_code == 401


def test_me_rejects_missing_token(client_with_db):
    client, _ = client_with_db
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_rejects_token_for_nonexistent_user(client_with_db):
    client, _ = client_with_db
    token = make_token(str(uuid.uuid4()), "student")
    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 401


def test_register_requires_admin(client_with_db):
    """POST /auth/register is now admin-only."""
    client, db = client_with_db
    student = insert_user(db, email="student@test.com", role="student")
    student_token = make_token(student.id, "student")

    # Student cannot register a new user
    with patch("app.api.auth.create_admin_client"):
        r = client.post(
            "/auth/register",
            json={"email": "new@test.com", "password": "pw123456", "role": "student"},
            headers=auth(student_token),
        )
    assert r.status_code == 403


def test_register_by_admin_creates_user(client_with_db):
    client, db = client_with_db
    admin = insert_user(db, email="admin@test.com", role="admin")
    admin_token = make_token(admin.id, "admin")

    new_user_id = str(uuid.uuid4())
    mock_sb = MagicMock()
    mock_sb.auth.admin.create_user.return_value = MagicMock(
        user=MagicMock(id=new_user_id)
    )

    with patch("app.api.auth.create_admin_client", return_value=mock_sb):
        r = client.post(
            "/auth/register",
            json={"email": "newstudent@test.com", "password": "pw123456", "role": "student", "name": "Alice"},
            headers=auth(admin_token),
        )

    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "newstudent@test.com"
    assert data["role"] == "student"
    assert data["id"] == new_user_id


def test_register_rejects_super_admin_role(client_with_db):
    client, db = client_with_db
    admin = insert_user(db, email="admin2@test.com", role="admin")
    admin_token = make_token(admin.id, "admin")

    with patch("app.api.auth.create_admin_client"):
        r = client.post(
            "/auth/register",
            json={"email": "hack@test.com", "password": "pw123456", "role": "super_admin"},
            headers=auth(admin_token),
        )
    assert r.status_code in (400, 403, 422)
