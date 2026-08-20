"""Runtime configuration, from environment variables.

Every setting has a dev-friendly default so `uvicorn app.main:app` runs with no
env. On the box, `DATABASE_URL`, `SESSION_SECRET`, and `CORS_ORIGINS` are set for
real; the defaults here are never used in production.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MANDARIN_", env_file=".env")

    # Reuse the box's existing Postgres, separate `mandarin` database.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/mandarin"

    # Signs session tokens (itsdangerous). MUST be overridden on the box.
    session_secret: str = "dev-only-not-secret"

    # Comma-separated allowed browser origins for CORS.
    cors_origins: str = "http://localhost:5173"

    # faster-whisper model; `base` is the tuned default, `tiny` degrades if RAM
    # is tight on the 2 GB box. Loaded lazily on first transcription.
    whisper_model: str = "base"
    whisper_compute_type: str = "int8"  # CPU-friendly, small footprint

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
