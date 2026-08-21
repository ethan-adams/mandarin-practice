"""FastAPI application entrypoint.

Phase 0: health. Phase 1: content API. Phase 2: transcription. Auth + progress
(Phase 3) get included here as they arrive (see docs/BUILD-PLAN.md).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .db import init_models
from .routers import auth, content, progress, transcribe

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_models()  # create tables if missing; idempotent
    yield


app = FastAPI(title="mandarin-api", version=__version__, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(content.router)
app.include_router(transcribe.router)
app.include_router(auth.router)
app.include_router(progress.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe. Mirrors CCP Signal's `{status, service}` shape."""
    return {"status": "ok", "service": "mandarin-api", "version": __version__}
