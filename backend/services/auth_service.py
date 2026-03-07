"""
认证服务：验证码、注册、登录、JWT
"""
import random
import re
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.models.user import User

VERIFY_CODE_KEY_PREFIX = "verify_code:"
VERIFY_CODE_RATE_PREFIX = "verify_rate:"


def _hash_password(password: str) -> str:
    rounds = 4 if settings.DEBUG else 12
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def _validate_password_strength(password: str) -> None:
    """
    生产规则：
    - 至少 8 位
    - 至少 1 个大写字母
    - 至少 1 个小写字母
    - 至少 1 个特殊字符
    开发模式（DEBUG=true）跳过，便于联调。
    """
    if settings.DEBUG:
        return
    if len(password) < 8:
        raise AppError("auth.password.tooShort")
    if not re.search(r"[A-Z]", password):
        raise AppError("auth.password.missingUppercase")
    if not re.search(r"[a-z]", password):
        raise AppError("auth.password.missingLowercase")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise AppError("auth.password.missingSpecial")


def _make_token(sub: str, expires_delta: timedelta, token_type: str = "access") -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": sub, "exp": expire, "type": token_type}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


async def send_verify_code(redis: Redis, email: str) -> str:
    """发送验证码：写入 Redis，防刷（同邮箱 60s 内只能发一次）。实际发邮件在后续通知模块接入。"""
    rate_key = f"{VERIFY_CODE_RATE_PREFIX}{email}"
    if await redis.get(rate_key):
        raise AppError("auth.sendCode.rateLimited")
    code = "".join(random.choices(string.digits, k=6))
    key = f"{VERIFY_CODE_KEY_PREFIX}{email}"
    await redis.setex(key, settings.VERIFY_CODE_EXPIRE_SECONDS, code)
    await redis.setex(rate_key, settings.VERIFY_CODE_RATE_LIMIT_SECONDS, "1")
    # TODO: 调用邮件服务发送 code 到 email
    # 开发阶段先直接打印到后端控制台，便于假邮箱联调
    print(f"[DEV] 验证码 {email} -> {code}")
    return code


async def verify_code(redis: Redis, email: str, code: str) -> bool:
    key = f"{VERIFY_CODE_KEY_PREFIX}{email}"
    stored = await redis.get(key)
    if not stored:
        return False
    if stored != code:
        return False
    await redis.delete(key)
    return True


async def register(
    db: AsyncSession,
    redis: Redis,
    username: str,
    password: str,
    email: str,
    code: str,
) -> User:
    """注册：校验验证码后创建用户。"""
    if not await verify_code(redis, email, code):
        raise AppError("auth.register.invalidCode")
    _validate_password_strength(password)
    existing = await db.execute(select(User).where((User.username == username) | (User.email == email)))
    if existing.scalar_one_or_none():
        raise AppError("auth.register.userExists")
    user = User(
        username=username,
        email=email,
        password_hash=_hash_password(password),
        email_verified=True,
    )
    db.add(user)
    await db.flush()

    from backend.services.quota_service import ensure_signup_bonus

    await ensure_signup_bonus(db, user.id)
    return user


async def authenticate_user(db: AsyncSession, username_or_email: str, password: str) -> User | None:
    """用户名或邮箱 + 密码 校验"""
    stmt = select(User).where((User.username == username_or_email) | (User.email == username_or_email))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active():
        return None
    if user.username == "root" and not settings.ENABLE_TEST_ACCOUNT:
        return None
    if not _verify_password(password, user.password_hash):
        return None
    return user


def create_access_token(user_id: UUID) -> str:
    return _make_token(
        str(user_id),
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
    )


def create_refresh_token(user_id: UUID) -> str:
    return _make_token(
        str(user_id),
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
    )


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()

