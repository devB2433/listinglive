"""
邀请码服务
"""
import secrets
from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.models.invite_code import InviteCode
from backend.models.user import User

INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_CODE_LENGTH = 8


def normalize_invite_code(value: str) -> str:
    return value.strip().upper()


def _build_invite_code_value(length: int = INVITE_CODE_LENGTH, *, alphabet: Iterable[str] = INVITE_CODE_ALPHABET) -> str:
    chars = tuple(alphabet)
    return "".join(secrets.choice(chars) for _ in range(length))


async def generate_invite_code_value(db: AsyncSession) -> str:
    for _ in range(20):
        code = _build_invite_code_value()
        stmt = select(InviteCode.id).where(InviteCode.code == code)
        if (await db.execute(stmt)).scalar_one_or_none() is None:
            return code
    raise AppError("inviteCodes.generateFailed", status_code=500)


async def get_user_invite_code(db: AsyncSession, user_id: UUID) -> InviteCode | None:
    stmt = select(InviteCode).where(InviteCode.owner_user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_admin_invite_codes(db: AsyncSession, *, limit: int = 100, offset: int = 0) -> list[InviteCode]:
    stmt = (
        select(InviteCode)
        .where(InviteCode.owner_user_id.is_(None))
        .order_by(InviteCode.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_user_invite_code(
    db: AsyncSession,
    *,
    owner_user_id: UUID,
    created_by_user_id: UUID,
) -> InviteCode:
    existing = await get_user_invite_code(db, owner_user_id)
    if existing is not None:
        raise AppError("inviteCodes.alreadyExists", status_code=409)

    invite_code = InviteCode(
        code=await generate_invite_code_value(db),
        owner_user_id=owner_user_id,
        created_by_user_id=created_by_user_id,
        is_active=True,
    )
    db.add(invite_code)
    await db.flush()
    return invite_code


async def create_admin_invite_code(
    db: AsyncSession,
    *,
    created_by_user_id: UUID,
    owner_user_id: UUID | None = None,
) -> InviteCode:
    if owner_user_id is not None:
        owner = await db.get(User, owner_user_id)
        if owner is None or not owner.is_active():
            raise AppError("inviteCodes.ownerNotFound", status_code=404)
        return await create_user_invite_code(
            db,
            owner_user_id=owner_user_id,
            created_by_user_id=created_by_user_id,
        )

    invite_code = InviteCode(
        code=await generate_invite_code_value(db),
        owner_user_id=None,
        created_by_user_id=created_by_user_id,
        is_active=True,
    )
    db.add(invite_code)
    await db.flush()
    return invite_code


async def validate_invite_code(db: AsyncSession, code: str) -> InviteCode:
    normalized_code = normalize_invite_code(code)
    if not normalized_code:
        raise AppError("auth.register.inviteCodeRequired")

    stmt = select(InviteCode).where(func.upper(InviteCode.code) == normalized_code)
    invite_code = (await db.execute(stmt)).scalar_one_or_none()
    if invite_code is None:
        raise AppError("auth.register.inviteCodeInvalid")
    if not invite_code.is_active:
        raise AppError("auth.register.inviteCodeDisabled")
    if invite_code.owner_user_id is None and invite_code.used_by_user_id is not None:
        raise AppError("auth.register.inviteCodeUsed")
    return invite_code


async def mark_invite_code_used(db: AsyncSession, invite_code: InviteCode, *, used_by_user_id: UUID) -> InviteCode:
    if invite_code.owner_user_id is not None:
        return invite_code
    if invite_code.used_by_user_id is not None:
        raise AppError("auth.register.inviteCodeUsed")
    invite_code.used_by_user_id = used_by_user_id
    invite_code.used_at = datetime.now(timezone.utc)
    await db.flush()
    return invite_code
