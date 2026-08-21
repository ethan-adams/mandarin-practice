"""Content tables. Cards and units are stored losslessly as JSON blobs plus a few
indexed columns, so `GET /v1/content` can reconstruct the exact envelope the app
expects (`{card_count, lesson_count, units, cards, audio}`) without a schema
migration every time the factory adds a card field.

Accounts + progress tables (Phase 3) land in a separate module later.
"""

from __future__ import annotations

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSON)  # full unit incl. nested lessons


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    lesson_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)  # full card object


class AppMeta(Base):
    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)  # ISO timestamp


class Progress(Base):
    __tablename__ = "progress"

    # One canonical snapshot per user (the server is authoritative post-pivot).
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[str] = mapped_column(String)
