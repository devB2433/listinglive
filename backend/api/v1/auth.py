"""
认证路由：发送验证码、注册、登录、刷新、登出
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db, get_redis
from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendCodeRequest,
    TokenResponse,
    RefreshRequest,
)
from backend.services.auth_service import (
    send_verify_code,
    verify_code,
    register as do_register,
    reset_password as do_reset_password,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_user_by_id,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _safe_email_domain(email: str) -> str:
    normalized = (email or "").strip().lower()
    if "@" not in normalized:
        return "invalid"
    return normalized.split("@", 1)[1]


@router.post("/send-code")
async def send_code(
    body: SendCodeRequest,
    redis: Redis = Depends(get_redis),
) -> dict:
    try:
        code = await send_verify_code(redis, body.email)
        payload = {"message": "ok"}
        if settings.DEBUG:
            payload["debug_code"] = code
        return payload
    except AppError as e:
        raise HTTPException(status_code=e.status_code, detail={"code": e.code})


@router.post("/register", response_model=TokenResponse)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TokenResponse:
    try:
        user = await do_register(db, redis, body.username, body.password, body.email, body.code, body.invite_code)
        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )
    except AppError as e:
        logger.warning(
            "register rejected code=%s username_len=%s email_domain=%s",
            e.code,
            len((body.username or "").strip()),
            _safe_email_domain(body.email),
        )
        raise HTTPException(status_code=e.status_code, detail={"code": e.code})
    except Exception as e:
        logger.exception("register error")
        if settings.DEBUG:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail={"code": "common.serverError"})


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    try:
        user = await authenticate_user(db, body.username_or_email, body.password, allow_root=False)
    except Exception as e:
        logger.exception("login authenticate_user error")
        if settings.DEBUG:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail={"code": "common.serverError"})
    if not user:
        raise HTTPException(status_code=401, detail={"code": "auth.login.invalidCredentials"})
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict:
    try:
        await do_reset_password(db, redis, body.email, body.code, body.new_password)
        return {"message": "ok"}
    except AppError as e:
        raise HTTPException(status_code=e.status_code, detail={"code": e.code})
    except Exception as e:
        logger.exception("reset_password error")
        if settings.DEBUG:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail={"code": "common.serverError"})


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail={"code": "auth.refresh.invalidToken"})
    from uuid import UUID
    user_id = UUID(payload["sub"])
    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active():
        raise HTTPException(status_code=401, detail={"code": "auth.refresh.userUnavailable"})
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/logout")
async def logout() -> dict:
    # 当前策略：前端丢弃 token 即可；若后续做 refresh 黑名单可在此写 Redis
    return {"message": "ok"}
