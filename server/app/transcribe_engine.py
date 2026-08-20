"""faster-whisper transcription, isolated so the router stays testable.

The model is imported and loaded **lazily on first use** (not at import), so the
service boots without touching CTranslate2 or model weights, and RAM is only spent
once a real transcription happens — the deliberate choice for the 2 GB box (see
VISION.md). Output is normalized traditional -> simplified when opencc is present.
"""

from __future__ import annotations

import os
import tempfile

from .config import get_settings

_model = None
_converter = "unset"


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel  # heavy; lazy

        s = get_settings()
        _model = WhisperModel(
            s.whisper_model, device="cpu", compute_type=s.whisper_compute_type
        )
    return _model


def _to_simplified(text: str) -> str:
    global _converter
    if _converter == "unset":
        try:
            from opencc import OpenCC

            _converter = OpenCC("t2s")
        except Exception:
            _converter = None
    return _converter.convert(text) if _converter else text


def transcribe_clip(data: bytes, filename: str = "clip.webm") -> str:
    """Transcribe raw audio bytes to simplified-Chinese text. Blocking (CPU)."""
    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        segments, _info = _get_model().transcribe(path, language="zh", beam_size=1)
        text = "".join(seg.text for seg in segments).strip()
    finally:
        os.unlink(path)
    return _to_simplified(text)
