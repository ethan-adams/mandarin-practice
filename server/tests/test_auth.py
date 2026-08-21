from fastapi.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app)


def test_register_login_me_flow():
    with _client() as c:
        r = c.post("/v1/auth/register", json={"email": "A@Example.com", "password": "hunter2hunter"})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        assert r.json()["email"] == "a@example.com"  # normalized lowercase

        me = c.get("/v1/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["email"] == "a@example.com"

        # login with the same creds returns a working token
        r2 = c.post("/v1/auth/login", json={"email": "a@example.com", "password": "hunter2hunter"})
        assert r2.status_code == 200
        assert c.get("/v1/auth/me", headers={"Authorization": f"Bearer {r2.json()['token']}"}).status_code == 200


def test_duplicate_register_conflicts():
    with _client() as c:
        c.post("/v1/auth/register", json={"email": "dup@example.com", "password": "password123"})
        r = c.post("/v1/auth/register", json={"email": "dup@example.com", "password": "password123"})
        assert r.status_code == 409


def test_wrong_password_rejected():
    with _client() as c:
        c.post("/v1/auth/register", json={"email": "wp@example.com", "password": "rightpassword"})
        r = c.post("/v1/auth/login", json={"email": "wp@example.com", "password": "wrongpassword"})
        assert r.status_code == 401


def test_me_requires_token():
    with _client() as c:
        assert c.get("/v1/auth/me").status_code == 401
        assert c.get("/v1/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_short_password_rejected():
    with _client() as c:
        r = c.post("/v1/auth/register", json={"email": "short@example.com", "password": "short"})
        assert r.status_code == 422
