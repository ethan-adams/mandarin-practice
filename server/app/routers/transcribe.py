"""POST /v1/transcribe — upload a short clip, get back recognized text.

The heavy CPU transcription runs in a threadpool so it never blocks the event
loop. The transcriber is injected via a dependency so tests can substitute a fake
without installing faster-whisper.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from ..transcribe_engine import transcribe_clip

router = APIRouter(prefix="/v1", tags=["transcribe"])

MAX_CLIP_BYTES = 2 * 1024 * 1024  # clips are ~30 KB; cap well above that

Transcriber = Callable[[bytes, str], str]


def get_transcriber() -> Transcriber:
    return transcribe_clip


@router.post("/transcribe")
async def transcribe(
    clip: UploadFile = File(...),
    transcriber: Transcriber = Depends(get_transcriber),
) -> dict:
    data = await clip.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty clip")
    if len(data) > MAX_CLIP_BYTES:
        raise HTTPException(status_code=413, detail="clip too large")

    text = await run_in_threadpool(transcriber, data, clip.filename or "clip.webm")
    return {"text": text, "language": "zh"}
