"""FastAPI application entrypoint.

Phase 0 (this file): health + app wiring. Content, transcription, auth, and
progress routers land in later phases (see docs/BUILD-PLAN.md) and are included
here as they arrive.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings

settings = get_settings()

app = FastAPI(title="mandarin-api", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe. Mirrors CCP Signal's `{status, service}` shape."""
    return {"status": "ok", "service": "mandarin-api", "version": __version__}


# Routers (added in later phases):
# from .routers import content, transcribe, auth, progress
# app.include_router(content.router)
# app.include_router(transcribe.router)
# app.include_router(auth.router)
# app.include_router(progress.router)
