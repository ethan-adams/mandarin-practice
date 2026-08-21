"""Accounts: register / login / me. Email + password, argon2id, signed bearer
token. Logout is client-side (drop the token)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, hash_password, issue_token, verify_password
from ..db import get_session
from ..models import User

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class AuthResult(BaseModel):
    token: str
    email: str


@router.post("/register", response_model=AuthResult)
async def register(body: Credentials, session: AsyncSession = Depends(get_session)) -> AuthResult:
    email = body.email.lower()
    existing = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="email already registered")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return AuthResult(token=issue_token(user.id), email=user.email)


@router.post("/login", response_model=AuthResult)
async def login(body: Credentials, session: AsyncSession = Depends(get_session)) -> AuthResult:
    email = body.email.lower()
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    # Uniform failure: don't reveal whether the email exists.
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status_code=401, detail="invalid email or password")
    return AuthResult(token=issue_token(user.id), email=user.email)


@router.get("/me")
async def me(user: User = Depends(current_user)) -> dict:
    return {"email": user.email, "id": user.id}
