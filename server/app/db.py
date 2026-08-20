"""Async SQLAlchemy engine + session, lazily built from settings.

Portable `JSON` columns (not Postgres `JSONB`) so the same models run on the box's
Postgres and on SQLite in tests — the corpus is small and read-mostly, so we don't
need JSONB indexing.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, future=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(), expire_on_commit=False, class_=AsyncSession
        )
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def init_models() -> None:
    """Create tables if missing. Idempotent; safe on every startup."""
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
