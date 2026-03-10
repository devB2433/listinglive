"""
邀请码路由
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db, require_root_user
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.invite_code import AdminCreateInviteCodeRequest, InviteCodeOut
from backend.services.invite_code_service import (
    create_admin_invite_code,
    create_user_invite_code,
    get_user_invite_code,
    list_admin_invite_codes,
)

router = APIRouter()
admin_router = APIRouter()


@router.get("/me", response_model=InviteCodeOut | None)
async def get_my_invite_code(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InviteCodeOut | None:
    return await get_user_invite_code(db, user.id)


@router.post("/me", response_model=InviteCodeOut, status_code=status.HTTP_201_CREATED)
async def create_my_invite_code(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InviteCodeOut:
    try:
        invite_code = await create_user_invite_code(db, owner_user_id=user.id, created_by_user_id=user.id)
        await db.commit()
        return invite_code
    except AppError as exc:
        await db.rollback()
        if exc.code == "inviteCodes.alreadyExists":
            existing = await get_user_invite_code(db, user.id)
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return existing
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@admin_router.post("", response_model=InviteCodeOut, status_code=status.HTTP_201_CREATED)
async def create_invite_code_by_admin(
    body: AdminCreateInviteCodeRequest,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> InviteCodeOut:
    try:
        invite_code = await create_admin_invite_code(
            db,
            created_by_user_id=current_user.id,
            owner_user_id=body.owner_user_id,
        )
        await db.commit()
        return invite_code
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@admin_router.get("", response_model=list[InviteCodeOut])
async def get_admin_invite_codes(
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> list[InviteCodeOut]:
    _ = current_user
    return await list_admin_invite_codes(db)
