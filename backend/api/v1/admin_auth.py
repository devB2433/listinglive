"""
管理员认证路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db
from backend.core.api_errors import AppError
from backend.schemas.auth import AdminLoginRequest, TokenResponse
from backend.services.admin_mfa_service import verify_admin_totp_code
from backend.services.auth_service import authenticate_user, create_access_token, create_refresh_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def admin_login(
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    try:
        user = await authenticate_user(db, body.username_or_email, body.password)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not user or user.username != "root":
        raise HTTPException(status_code=401, detail={"code": "admin.login.invalidCredentials"})

    try:
        verify_admin_totp_code(user, body.totp_code)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
