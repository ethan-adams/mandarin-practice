"""Transcription endpoint: exercise the HTTP contract with a fake transcriber, so
the real faster-whisper model is never needed in tests."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.transcribe import get_tone_analyzer, get_transcriber


def _fake_transcriber(text: str):
    def _t(data: bytes, filename: str) -> str:
        assert data  # got the bytes
        return text

    return _t


def _fake_analyzer(text: str, tone: dict | None):
    def _a(data: bytes, filename: str, tones: list[int]) -> dict:
        assert data and tones  # got the bytes and the expected tones
        return {"text": text, "tone": tone}

    return _a


def test_transcribe_returns_text():
    app.dependency_overrides[get_transcriber] = lambda: _fake_transcriber("你好")
    try:
        with TestClient(app) as client:
            r = client.post("/v1/transcribe", files={"clip": ("clip.webm", b"\x00\x01\x02", "audio/webm")})
        assert r.status_code == 200
        assert r.json() == {"text": "你好", "language": "zh"}
    finally:
        app.dependency_overrides.clear()


def test_transcribe_rejects_empty_clip():
    app.dependency_overrides[get_transcriber] = lambda: _fake_transcriber("unused")
    try:
        with TestClient(app) as client:
            r = client.post("/v1/transcribe", files={"clip": ("clip.webm", b"", "audio/webm")})
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_transcribe_with_tones_returns_tone_verdict():
    tone = {"status": "matched", "syllables": [{"expected": 3, "observed": "dipping", "status": "matched"}]}
    app.dependency_overrides[get_tone_analyzer] = lambda: _fake_analyzer("你好", tone)
    try:
        with TestClient(app) as client:
            r = client.post(
                "/v1/transcribe",
                files={"clip": ("clip.webm", b"\x00\x01\x02", "audio/webm")},
                data={"tones": "[3, 3]"},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["text"] == "你好"
        assert body["tone"]["status"] == "matched"
    finally:
        app.dependency_overrides.clear()


def test_transcribe_rejects_malformed_tones():
    with TestClient(app) as client:
        r = client.post(
            "/v1/transcribe",
            files={"clip": ("clip.webm", b"\x00\x01\x02", "audio/webm")},
            data={"tones": "not-json"},
        )
    assert r.status_code == 400
