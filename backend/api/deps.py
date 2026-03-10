"""
公共依赖：get_db, get_redis, get_current_user
"""
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.services.auth_service import decode_token, get_user_by_id
from backend.models.user import User

security = HTTPBearer(auto_error=False)


async def get_redis():
    from backend.core.redis_client import get_redis as _get_redis
    return await _get_redis()


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证信息")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的 token")
    user_id = UUID(payload["sub"])
    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    return user


async def require_root_user(user: User = Depends(get_current_user)) -> User:
    if user.username != "root":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "common.forbidden"})
    return user


__all__ = ["get_db", "get_redis", "get_current_user", "require_root_user"]
