from fastapi.testclient import TestClient

from app.main import app


def test_register_login_me_flow() -> None:
    client = TestClient(app)

    register = client.post(
        "/auth/register",
        json={"email": "admin@example.com", "password": "secret123", "role": "admin"},
    )
    assert register.status_code == 201

    login = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "secret123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@example.com"
