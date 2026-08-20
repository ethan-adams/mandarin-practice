"""Transcription endpoint: exercise the HTTP contract with a fake transcriber, so
the real faster-whisper model is never needed in tests."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.transcribe import get_transcriber


def _fake_transcriber(text: str):
    def _t(data: bytes, filename: str) -> str:
        assert data  # got the bytes
        return text

    return _t


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
