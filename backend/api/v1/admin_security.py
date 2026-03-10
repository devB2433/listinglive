"""
管理员安全设置路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db, require_root_user
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.admin import (
    AdminMfaDisableRequest,
    AdminMfaEnableRequest,
    AdminMfaSetupOut,
    AdminMfaStatusOut,
)
from backend.services.admin_mfa_service import (
    disable_admin_mfa,
    enable_admin_mfa,
    get_admin_mfa_status,
    prepare_admin_mfa_setup,
)

router = APIRouter()


@router.get("/mfa/status", response_model=AdminMfaStatusOut)
async def get_admin_mfa_status_route(
    current_user: User = Depends(require_root_user),
) -> AdminMfaStatusOut:
    return AdminMfaStatusOut(**get_admin_mfa_status(current_user))


@router.post("/mfa/setup", response_model=AdminMfaSetupOut)
async def setup_admin_mfa(
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminMfaSetupOut:
    try:
        payload = await prepare_admin_mfa_setup(db, current_user)
        await db.commit()
        return AdminMfaSetupOut(**payload)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/mfa/enable", response_model=AdminMfaStatusOut)
async def enable_admin_mfa_route(
    body: AdminMfaEnableRequest,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminMfaStatusOut:
    try:
        payload = await enable_admin_mfa(db, current_user, body.code)
        await db.commit()
        return AdminMfaStatusOut(**payload)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/mfa/disable", response_model=AdminMfaStatusOut)
async def disable_admin_mfa_route(
    body: AdminMfaDisableRequest,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminMfaStatusOut:
    try:
        payload = await disable_admin_mfa(db, current_user, body.code)
        await db.commit()
        return AdminMfaStatusOut(**payload)
    except AppError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
