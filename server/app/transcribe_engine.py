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
    return transcribe_detailed(data, filename)["text"]


def transcribe_detailed(data: bytes, filename: str = "clip.webm", word_timestamps: bool = False) -> dict:
    """Transcribe and optionally return per-word timings from the SAME pass.

    Returns ``{"text": str, "words": [{"char": str, "start": float, "end": float}]}``.
    ``words`` is populated only when ``word_timestamps`` is requested; each Han
    character gets its own span (a multi-char Whisper word is split evenly across
    its characters) so the tone engine can line syllables up. Blocking (CPU)."""
    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        segments, _info = _get_model().transcribe(
            path, language="zh", beam_size=1, word_timestamps=word_timestamps
        )
        segments = list(segments)
        text = "".join(seg.text for seg in segments).strip()
        words: list[dict] = []
        if word_timestamps:
            for seg in segments:
                for word in getattr(seg, "words", None) or []:
                    words.extend(_split_word_chars(word))
    finally:
        os.unlink(path)
    return {"text": _to_simplified(text), "words": words}


def _split_word_chars(word) -> list[dict]:
    """Split one Whisper word span into per-Han-character spans (even time)."""
    chars = [c for c in (word.word or "") if _is_han(c)]
    if not chars:
        return []
    start, end = float(word.start), float(word.end)
    step = (end - start) / len(chars)
    return [
        {"char": _to_simplified(c), "start": start + i * step, "end": start + (i + 1) * step}
        for i, c in enumerate(chars)
    ]


def _is_han(ch: str) -> bool:
    return "一" <= ch <= "鿿"
