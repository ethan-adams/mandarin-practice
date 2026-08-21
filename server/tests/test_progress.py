from fastapi.testclient import TestClient

from app.main import app
from app.progress_merge import merge_snapshots


def _snap(updated, review, days, count=0):
    return {
        "v": 1,
        "updatedAt": updated,
        "reviewState": review,
        "practiceDays": days,
        "listeningResults": [],
        "listeningCount": count,
        "pronunciationEvidence": [],
    }


def test_merge_never_clobbers():
    a = _snap("2026-08-01", {"c1": {"attempts": 3, "due": "2026-09-01"}}, ["2026-08-01"], count=5)
    b = _snap("2026-08-02", {"c1": {"attempts": 1, "due": "2026-08-10"},
                             "c2": {"attempts": 2, "due": "2026-08-20"}}, ["2026-08-02"], count=2)
    m = merge_snapshots(a, b)
    assert m["reviewState"]["c1"]["attempts"] == 3      # more-progressed wins
    assert m["reviewState"]["c2"]["attempts"] == 2      # union of cards
    assert m["practiceDays"] == ["2026-08-01", "2026-08-02"]  # day union
    assert m["listeningCount"] == 5                     # max
    assert m["updatedAt"] == "2026-08-02"               # later wins


def _auth_headers(c, email):
    tok = c.post("/v1/auth/register", json={"email": email, "password": "password123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_progress_put_get_and_merge_endpoint():
    with TestClient(app) as c:
        h = _auth_headers(c, "prog@example.com")

        # empty to start
        assert c.get("/v1/progress", headers=h).json()["snapshot"] is None

        s1 = _snap("2026-08-01", {"c1": {"attempts": 1, "due": "2026-08-05"}}, ["2026-08-01"])
        r1 = c.put("/v1/progress", headers=h, json={"snapshot": s1})
        assert r1.status_code == 200
        assert r1.json()["snapshot"]["reviewState"]["c1"]["attempts"] == 1

        # a second device with more progress on c1 + a new day merges, not clobbers
        s2 = _snap("2026-08-03", {"c1": {"attempts": 4, "due": "2026-09-01"}}, ["2026-08-03"])
        r2 = c.put("/v1/progress", headers=h, json={"snapshot": s2})
        merged = r2.json()["snapshot"]
        assert merged["reviewState"]["c1"]["attempts"] == 4
        assert merged["practiceDays"] == ["2026-08-01", "2026-08-03"]

        # GET now returns the canonical merged snapshot
        assert c.get("/v1/progress", headers=h).json()["snapshot"]["practiceDays"] == ["2026-08-01", "2026-08-03"]


def test_progress_requires_auth():
    with TestClient(app) as c:
        assert c.get("/v1/progress").status_code == 401
        assert c.put("/v1/progress", json={"snapshot": {}}).status_code == 401


def test_put_rejects_bad_snapshot():
    with TestClient(app) as c:
        h = _auth_headers(c, "bad@example.com")
        assert c.put("/v1/progress", headers=h, json={"snapshot": {"nope": 1}}).status_code == 422
