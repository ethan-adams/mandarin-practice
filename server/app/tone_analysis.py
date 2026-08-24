"""Glue: one clip + expected tones -> {text, tone}, from a single Whisper pass.

Kept apart from the router so it can pull in the heavy trio (faster-whisper for
the detailed pass, av to decode, numpy for F0) lazily, and apart from
tone_engine so the pure-DSP engine stays trivially unit-testable without them.
"""

from __future__ import annotations

from .audio_decode import decode_to_mono
from .tone_engine import assess_tones
from .transcribe_engine import transcribe_detailed


def analyze_clip(data: bytes, filename: str, expected_tones: list[int]) -> dict:
    """Transcribe (with word timings) and assess tone from the same audio.

    Returns ``{"text": str, "tone": {...} | None}``. Transcription always
    succeeds or raises; tone degrades to None if the audio can't be decoded, so
    word check never fails just because tone did."""
    detail = transcribe_detailed(data, filename, word_timestamps=True)
    text = detail["text"]

    try:
        samples, sr = decode_to_mono(data)
    except Exception:
        return {"text": text, "tone": None}

    word_spans = [(w["start"], w["end"]) for w in detail.get("words", [])]
    assessment = assess_tones(samples, sr, expected_tones, word_spans or None)
    return {"text": text, "tone": assessment.as_dict()}
