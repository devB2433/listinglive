"""
管理后台用户路由
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db, require_root_user
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.admin import AdminResetUserPasswordRequest, AdminUserListItemOut, AdminUserListOut
from backend.services.admin_user_service import (
    admin_reset_user_password,
    archive_user,
    block_user,
    get_admin_user_or_404,
    list_admin_users,
    unblock_user,
)

router = APIRouter()


@router.get("", response_model=AdminUserListOut)
async def get_admin_users(
    query: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListOut:
    _ = current_user
    result = await list_admin_users(db, query=query, status=status, page=page, page_size=page_size)
    return AdminUserListOut(
        items=[AdminUserListItemOut.model_validate(item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/{user_id}", response_model=AdminUserListItemOut)
async def get_admin_user(
    user_id: UUID,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListItemOut:
    _ = current_user
    try:
        return AdminUserListItemOut.model_validate(await get_admin_user_or_404(db, user_id))
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/{user_id}/block", response_model=AdminUserListItemOut)
async def block_admin_user(
    user_id: UUID,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListItemOut:
    _ = current_user
    try:
        user = await block_user(db, user_id)
        await db.commit()
        return AdminUserListItemOut.model_validate(user)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/{user_id}/unblock", response_model=AdminUserListItemOut)
async def unblock_admin_user(
    user_id: UUID,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListItemOut:
    _ = current_user
    try:
        user = await unblock_user(db, user_id)
        await db.commit()
        return AdminUserListItemOut.model_validate(user)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/{user_id}/reset-password", response_model=AdminUserListItemOut)
async def reset_admin_user_password(
    user_id: UUID,
    body: AdminResetUserPasswordRequest,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListItemOut:
    _ = current_user
    try:
        user = await admin_reset_user_password(db, user_id, new_password=body.new_password)
        await db.commit()
        return AdminUserListItemOut.model_validate(user)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/{user_id}/archive", response_model=AdminUserListItemOut)
async def archive_admin_user(
    user_id: UUID,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListItemOut:
    try:
        user = await archive_user(db, user_id=user_id, archived_by_user_id=current_user.id)
        await db.commit()
        return AdminUserListItemOut.model_validate(user)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
