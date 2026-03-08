"""
Tests for the Users API endpoints.

Covers:
  GET  /users            – list users (admin only)
  POST /auth/register    – create user (admin-only with Supabase)
  PATCH /users/{id}      – edit user (name / email / role)
  PATCH /users/{id}/password – reset password
  DELETE /users/{id}     – delete user

Edge cases tested:
  - unauthenticated / non-admin access → 403 / 401
  - email uniqueness enforcement
  - invalid / protected role assignment
  - self-role-change blocked
  - self-delete blocked
  - super_admin row protection for admin callers
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.models.user import User
from tests.conftest import auth, insert_user, make_token


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def admin(db_session):
    return insert_user(db_session, email="admin@test.com", role="admin", name="Admin")


@pytest.fixture()
def admin_token(admin):
    return make_token(admin.id, "admin")


@pytest.fixture()
def student(db_session):
    return insert_user(db_session, email="student@test.com", role="student", name="Student")


@pytest.fixture()
def student_token(student):
    return make_token(student.id, "student")


@pytest.fixture()
def super_admin_user(db_session):
    return insert_user(db_session, email="superadmin@test.com", role="super_admin", name="Super Admin")


@pytest.fixture()
def super_admin_token(super_admin_user):
    return make_token(super_admin_user.id, "super_admin")


def mock_sb():
    """Return a mock Supabase client that succeeds on all admin calls."""
    m = MagicMock()
    m.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id=str(uuid.uuid4())))
    return m


# ── GET /users ────────────────────────────────────────────────────────────────

class TestListUsers:
    def test_admin_can_list_users(self, client, admin_token):
        r = client.get("/users", headers=auth(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_student_cannot_list_users(self, client, student_token):
        r = client.get("/users", headers=auth(student_token))
        assert r.status_code == 403

    def test_unauthenticated_cannot_list_users(self, client):
        r = client.get("/users")
        assert r.status_code == 401

    def test_role_filter(self, client, db_session, admin_token):
        insert_user(db_session, email="lect1@test.com", role="lecturer")
        r = client.get("/users?role=lecturer", headers=auth(admin_token))
        assert r.status_code == 200
        roles = {u["role"] for u in r.json()}
        assert roles == {"lecturer"}


# ── POST /auth/register (create user) ────────────────────────────────────────

class TestCreateUser:
    def test_create_student(self, client, admin_token):
        new_id = str(uuid.uuid4())
        sb = MagicMock()
        sb.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id=new_id))
        with patch("app.api.auth.create_admin_client", return_value=sb):
            r = client.post(
                "/auth/register",
                json={"email": "new@test.com", "password": "pw123456", "role": "student"},
                headers=auth(admin_token),
            )
        assert r.status_code == 201
        assert r.json()["role"] == "student"

    def test_create_with_name(self, client, admin_token):
        new_id = str(uuid.uuid4())
        sb = MagicMock()
        sb.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id=new_id))
        with patch("app.api.auth.create_admin_client", return_value=sb):
            r = client.post(
                "/auth/register",
                json={"email": "named@test.com", "password": "pw123456", "role": "lecturer", "name": "Dr. Smith"},
                headers=auth(admin_token),
            )
        assert r.status_code == 201
        assert r.json()["name"] == "Dr. Smith"

    def test_duplicate_email_rejected(self, client, db_session, admin_token):
        insert_user(db_session, email="dup@test.com", role="student")
        with patch("app.api.auth.create_admin_client", return_value=mock_sb()):
            r = client.post(
                "/auth/register",
                json={"email": "dup@test.com", "password": "other123", "role": "student"},
                headers=auth(admin_token),
            )
        assert r.status_code == 409

    def test_create_super_admin_via_register_rejected(self, client, admin_token):
        with patch("app.api.auth.create_admin_client", return_value=mock_sb()):
            r = client.post(
                "/auth/register",
                json={"email": "hack@test.com", "password": "pw123456", "role": "super_admin"},
                headers=auth(admin_token),
            )
        assert r.status_code in (400, 403, 422)

    def test_student_cannot_register(self, client, student_token):
        with patch("app.api.auth.create_admin_client", return_value=mock_sb()):
            r = client.post(
                "/auth/register",
                json={"email": "x@test.com", "password": "pw123456", "role": "student"},
                headers=auth(student_token),
            )
        assert r.status_code == 403


# ── PATCH /users/{id} (edit user) ────────────────────────────────────────────

class TestEditUser:
    def test_admin_can_edit_name(self, client, db_session, admin_token):
        user = insert_user(db_session, email="edit_me@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"name": "Updated Name"}, headers=auth(admin_token))
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"

    def test_admin_can_edit_email(self, client, db_session, admin_token):
        user = insert_user(db_session, email="old_email@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"email": "new_email@test.com"}, headers=auth(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == "new_email@test.com"

    def test_admin_can_change_role(self, client, db_session, admin_token):
        user = insert_user(db_session, email="role_change@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"role": "lecturer"}, headers=auth(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "lecturer"

    def test_email_conflict_rejected(self, client, db_session, admin_token):
        insert_user(db_session, email="existing@test.com", role="student")
        user = insert_user(db_session, email="other@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"email": "existing@test.com"}, headers=auth(admin_token))
        assert r.status_code == 409

    def test_invalid_role_rejected(self, client, db_session, admin_token):
        user = insert_user(db_session, email="badRole@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"role": "god"}, headers=auth(admin_token))
        assert r.status_code == 400

    def test_cannot_assign_super_admin_role(self, client, db_session, admin_token):
        user = insert_user(db_session, email="norole@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"role": "super_admin"}, headers=auth(admin_token))
        assert r.status_code == 403

    def test_cannot_change_own_role(self, client, admin, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{admin.id}", json={"role": "lecturer"}, headers=auth(admin_token))
        assert r.status_code == 403

    def test_admin_cannot_edit_super_admin(self, client, super_admin_user, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{super_admin_user.id}", json={"name": "Hacker"}, headers=auth(admin_token))
        assert r.status_code == 403

    def test_super_admin_can_edit_super_admin(self, client, super_admin_user, super_admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{super_admin_user.id}", json={"name": "New SA Name"}, headers=auth(super_admin_token))
        assert r.status_code == 200
        assert r.json()["name"] == "New SA Name"

    def test_student_cannot_edit_user(self, client, db_session, student_token):
        user = insert_user(db_session, email="victim@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"name": "Hacked"}, headers=auth(student_token))
        assert r.status_code == 403

    def test_unauthenticated_cannot_edit(self, client, db_session):
        user = insert_user(db_session, email="unauth_edit@test.com", role="student")
        r = client.patch(f"/users/{user.id}", json={"name": "X"})
        assert r.status_code == 401

    def test_edit_nonexistent_user(self, client, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{uuid.uuid4()}", json={"name": "Ghost"}, headers=auth(admin_token))
        assert r.status_code == 404

    def test_partial_update_preserves_other_fields(self, client, db_session, admin_token):
        user = insert_user(db_session, email="partial@test.com", role="student", name="Original Name")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}", json={"email": "partial_new@test.com"}, headers=auth(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Original Name"
        assert data["role"] == "student"
        assert data["email"] == "partial_new@test.com"


# ── PATCH /users/{id}/password ────────────────────────────────────────────────

class TestResetPassword:
    def test_admin_can_reset_password(self, client, db_session, admin_token):
        user = insert_user(db_session, email="reset_pw@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}/password", json={"new_password": "newpass123"}, headers=auth(admin_token))
        assert r.status_code == 200

    def test_admin_cannot_reset_super_admin_password(self, client, super_admin_user, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{super_admin_user.id}/password", json={"new_password": "hacked!"}, headers=auth(admin_token))
        assert r.status_code == 403

    def test_super_admin_can_reset_super_admin_password(self, client, super_admin_user, super_admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{super_admin_user.id}/password", json={"new_password": "newsuperpass"}, headers=auth(super_admin_token))
        assert r.status_code == 200

    def test_student_cannot_reset_password(self, client, db_session, student_token):
        user = insert_user(db_session, email="reset_target@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{user.id}/password", json={"new_password": "hacked"}, headers=auth(student_token))
        assert r.status_code == 403

    def test_reset_nonexistent_user(self, client, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.patch(f"/users/{uuid.uuid4()}/password", json={"new_password": "x"}, headers=auth(admin_token))
        assert r.status_code == 404


# ── DELETE /users/{id} ───────────────────────────────────────────────────────

class TestDeleteUser:
    def test_admin_can_delete_user(self, client, db_session, admin_token):
        user = insert_user(db_session, email="to_delete@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{user.id}", headers=auth(admin_token))
        assert r.status_code == 204
        listing = client.get("/users", headers=auth(admin_token)).json()
        assert user.id not in [u["id"] for u in listing]

    def test_admin_cannot_delete_self(self, client, admin, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{admin.id}", headers=auth(admin_token))
        assert r.status_code == 403

    def test_admin_cannot_delete_super_admin(self, client, super_admin_user, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{super_admin_user.id}", headers=auth(admin_token))
        assert r.status_code == 403

    def test_super_admin_cannot_delete_self(self, client, super_admin_user, super_admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{super_admin_user.id}", headers=auth(super_admin_token))
        assert r.status_code == 403

    def test_student_cannot_delete_user(self, client, db_session, student_token):
        user = insert_user(db_session, email="del_target@test.com", role="student")
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{user.id}", headers=auth(student_token))
        assert r.status_code == 403

    def test_delete_nonexistent_user(self, client, admin_token):
        with patch("app.api.users.create_admin_client", return_value=mock_sb()):
            r = client.delete(f"/users/{uuid.uuid4()}", headers=auth(admin_token))
        assert r.status_code == 404
