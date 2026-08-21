"""Server-owned progress. GET returns the canonical snapshot; PUT merges the
client's snapshot into it (never clobber) and returns the merged result, which the
client then applies. Replaces the encrypted-sync `/v1/blob` path."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import Progress, User
from ..progress_merge import is_snapshot, merge_snapshots

router = APIRouter(prefix="/v1", tags=["progress"])


@router.get("/progress")
async def get_progress(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await session.get(Progress, user.id)
    return {"snapshot": row.snapshot if row else None}


@router.put("/progress")
async def put_progress(
    body: dict,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    incoming = body.get("snapshot")
    if not is_snapshot(incoming):
        raise HTTPException(status_code=422, detail="invalid snapshot")
    row = await session.get(Progress, user.id)
    merged = merge_snapshots(row.snapshot if row else None, incoming)
    now = datetime.now(timezone.utc).isoformat()
    if row is None:
        session.add(Progress(user_id=user.id, snapshot=merged, updated_at=now))
    else:
        row.snapshot = merged
        row.updated_at = now
    await session.commit()
    return {"snapshot": merged}
