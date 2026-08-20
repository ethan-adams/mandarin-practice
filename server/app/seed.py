"""Seed the content tables from a corpus payload (the factory's
`public/mandarin-source.json`). Full-replace and idempotent: re-running it
reflects the latest corpus exactly.
"""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AppMeta, Card, Unit


async def seed_payload(session: AsyncSession, payload: dict) -> dict[str, int]:
    units = payload.get("units") or []
    cards = payload.get("cards") or []

    await session.execute(delete(Card))
    await session.execute(delete(Unit))
    await session.execute(delete(AppMeta))

    for unit in units:
        session.add(Unit(id=unit["id"], order=int(unit.get("order", 0)), data=unit))
    for card in cards:
        session.add(Card(id=card["id"], lesson_id=card.get("lessonId"), data=card))

    session.add(
        AppMeta(
            key="corpus",
            value={
                "audio": payload.get("audio"),
                "lesson_count": payload.get("lesson_count"),
                "card_count": payload.get("card_count"),
            },
        )
    )
    await session.commit()
    return {"units": len(units), "cards": len(cards)}
