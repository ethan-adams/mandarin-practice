"""GET /v1/content — the deck payload, reassembled from Postgres in the exact
envelope the app's `deck.ts` expects (shape-compatible with the old
`public/mandarin-source.json`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import AppMeta, Card, Unit

router = APIRouter(prefix="/v1", tags=["content"])


@router.get("/content")
async def get_content(session: AsyncSession = Depends(get_session)) -> dict:
    units = (await session.execute(select(Unit).order_by(Unit.order))).scalars().all()
    cards = (await session.execute(select(Card))).scalars().all()
    meta_row = (
        await session.execute(select(AppMeta).where(AppMeta.key == "corpus"))
    ).scalar_one_or_none()
    meta = meta_row.value if meta_row else {}

    return {
        "card_count": meta.get("card_count") or len(cards),
        "lesson_count": meta.get("lesson_count"),
        "units": [u.data for u in units],
        "cards": [c.data for c in cards],
        "audio": meta.get("audio"),
    }
