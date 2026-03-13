"""
管理后台用户服务
"""
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.models.user import User, UserStatus
from backend.services.auth_service import _hash_password, _validate_password_strength


async def list_admin_users(
    db: AsyncSession,
    *,
    query: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    filters = []
    normalized_query = query.strip().lower() if query else None
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(or_(func.lower(User.username).like(pattern), func.lower(User.email).like(pattern)))
    if status:
        filters.append(User.status == status)

    total_stmt = select(func.count(User.id))
    items_stmt = select(User).order_by(User.created_at.desc())
    if filters:
        total_stmt = total_stmt.where(*filters)
        items_stmt = items_stmt.where(*filters)

    total = int((await db.execute(total_stmt)).scalar_one() or 0)
    items_stmt = items_stmt.offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(items_stmt)).scalars().all())
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def get_admin_user_or_404(db: AsyncSession, user_id) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise AppError("admin.users.notFound", status_code=404)
    return user


async def block_user(db: AsyncSession, user_id) -> User:
    user = await get_admin_user_or_404(db, user_id)
    if user.username == "root":
        raise AppError("admin.users.cannotBlockRoot", status_code=400)
    if user.status == UserStatus.ARCHIVED.value:
        raise AppError("admin.users.archivedReadOnly", status_code=400)
    user.status = UserStatus.BLOCKED.value
    await db.flush()
    return user


async def unblock_user(db: AsyncSession, user_id) -> User:
    user = await get_admin_user_or_404(db, user_id)
    if user.status == UserStatus.ARCHIVED.value:
        raise AppError("admin.users.archivedReadOnly", status_code=400)
    user.status = UserStatus.ACTIVE.value
    await db.flush()
    return user


async def admin_reset_user_password(db: AsyncSession, user_id, *, new_password: str) -> User:
    user = await get_admin_user_or_404(db, user_id)
    if user.status == UserStatus.ARCHIVED.value:
        raise AppError("admin.users.archivedReadOnly", status_code=400)
    _validate_password_strength(new_password)
    user.password_hash = _hash_password(new_password)
    user.email_verified = True
    await db.flush()
    return user


async def archive_user(db: AsyncSession, *, user_id, archived_by_user_id) -> User:
    user = await get_admin_user_or_404(db, user_id)
    if user.username == "root":
        raise AppError("admin.users.cannotArchiveRoot", status_code=400)
    if user.status == UserStatus.ARCHIVED.value:
        raise AppError("admin.users.alreadyArchived", status_code=400)
    user.status = UserStatus.ARCHIVED.value
    user.archived_at = datetime.now(timezone.utc)
    user.archived_by_user_id = archived_by_user_id
    await db.flush()
    return user
