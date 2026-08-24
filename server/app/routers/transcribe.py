"""POST /v1/transcribe - upload a short clip, get back recognized text and,
when the card's expected tones are supplied, a per-syllable tone verdict.

Both come from a SINGLE faster-whisper pass (word timings feed the tone engine),
so word check + tone cost one request and one model run. The heavy CPU work runs
in a threadpool so it never blocks the event loop. Transcriber and tone analyzer
are injected so tests can substitute fakes without faster-whisper, av, or numpy.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from ..transcribe_engine import transcribe_clip

router = APIRouter(prefix="/v1", tags=["transcribe"])

MAX_CLIP_BYTES = 2 * 1024 * 1024  # clips are ~30 KB; cap well above that
MAX_SYLLABLES = 16  # a practice answer is a handful of syllables; reject abuse

Transcriber = Callable[[bytes, str], str]
# (data, filename, expected_tones) -> {"text": str, "tone": {...}}
ToneAnalyzer = Callable[[bytes, str, list[int]], dict]


def get_transcriber() -> Transcriber:
    return transcribe_clip


def get_tone_analyzer() -> ToneAnalyzer:
    # Imported lazily: pulls in the whisper detailed pass, av, and numpy, none of
    # which the text-only path or the tests need.
    from ..tone_analysis import analyze_clip

    return analyze_clip


def _parse_tones(raw: Optional[str]) -> Optional[list[int]]:
    """Parse the optional `tones` form field: a JSON array of tone numbers
    (1-4, 5=neutral). Returns None when absent, raises 400 when malformed."""
    if raw is None or raw.strip() == "":
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="tones must be a JSON array")
    if not isinstance(parsed, list) or not all(isinstance(t, int) for t in parsed):
        raise HTTPException(status_code=400, detail="tones must be a JSON array of integers")
    if not parsed or len(parsed) > MAX_SYLLABLES:
        raise HTTPException(status_code=400, detail="tones out of range")
    if not all(0 <= t <= 5 for t in parsed):
        raise HTTPException(status_code=400, detail="each tone must be 0-5")
    return parsed


@router.post("/transcribe")
async def transcribe(
    clip: UploadFile = File(...),
    tones: Optional[str] = Form(default=None),
    transcriber: Transcriber = Depends(get_transcriber),
    tone_analyzer: ToneAnalyzer = Depends(get_tone_analyzer),
) -> dict:
    data = await clip.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty clip")
    if len(data) > MAX_CLIP_BYTES:
        raise HTTPException(status_code=413, detail="clip too large")

    expected_tones = _parse_tones(tones)
    filename = clip.filename or "clip.webm"

    if expected_tones is None:
        text = await run_in_threadpool(transcriber, data, filename)
        return {"text": text, "language": "zh"}

    # One pass gives text + per-syllable tone. If the tone stage fails (bad audio,
    # av missing), degrade to text-only rather than 500 the word check.
    try:
        result = await run_in_threadpool(tone_analyzer, data, filename, expected_tones)
    except Exception:
        text = await run_in_threadpool(transcriber, data, filename)
        return {"text": text, "language": "zh", "tone": None}
    return {"text": result.get("text", ""), "language": "zh", "tone": result.get("tone")}
