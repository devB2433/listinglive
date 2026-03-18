"""
认证服务：验证码、注册、登录、JWT
"""
import random
import re
import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt
from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.models.user import User, UserStatus
from backend.services.email_service import send_verification_code_email
from backend.services.invite_code_service import mark_invite_code_used, normalize_invite_code, validate_invite_code

VERIFY_CODE_KEY_PREFIX = "verify_code:"
VERIFY_CODE_RATE_PREFIX = "verify_rate:"


def _normalize_auth_identity(value: str) -> str:
    return value.strip().lower()


def _hash_password(password: str) -> str:
    rounds = 4 if settings.DEBUG else 12
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("utf-8")


def _normalize_username_seed(value: str) -> str:
    lowered = _normalize_auth_identity(value)
    sanitized = re.sub(r"[^a-z0-9._-]+", "-", lowered).strip("-._")
    if not sanitized:
        return "user"
    return sanitized[:64]


def _exclude_archived_users(stmt):
    archived = UserStatus.ARCHIVED.value
    normalized_status = func.lower(func.trim(func.coalesce(User.status, "")))
    return stmt.where(normalized_status != archived)


async def _normalize_archived_status_values(db: AsyncSession) -> None:
    """
    历史脏数据兼容：
    统一把 ARCHIVED / archived<spaces> 归一化为 archived，
    避免注册重名判断把已归档用户当作占用。
    """
    archived = UserStatus.ARCHIVED.value
    normalized_status = func.lower(func.trim(func.coalesce(User.status, "")))
    await db.execute(
        update(User)
        .where(normalized_status == archived, User.status != archived)
        .values(status=archived)
    )


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
    """发送验证码：写入 Redis，防刷（同邮箱 60s 内只能发一次）。"""
    email = _normalize_auth_identity(email)
    rate_key = f"{VERIFY_CODE_RATE_PREFIX}{email}"
    if await redis.get(rate_key):
        raise AppError("auth.sendCode.rateLimited")
    code = "".join(random.choices(string.digits, k=6))
    key = f"{VERIFY_CODE_KEY_PREFIX}{email}"
    await redis.setex(key, settings.VERIFY_CODE_EXPIRE_SECONDS, code)
    await redis.setex(rate_key, settings.VERIFY_CODE_RATE_LIMIT_SECONDS, "1")
    try:
        await send_verification_code_email(email, code)
    except AppError:
        await redis.delete(key)
        await redis.delete(rate_key)
        raise
    if settings.DEBUG:
        print(f"[DEV] 验证码 {email} -> {code}")
    return code


async def verify_code(redis: Redis, email: str, code: str) -> bool:
    email = _normalize_auth_identity(email)
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
    invite_code: str,
) -> User:
    """注册：校验验证码后创建用户。"""
    await _normalize_archived_status_values(db)
    username = _normalize_auth_identity(username)
    email = _normalize_auth_identity(email)
    if not username:
        raise AppError("auth.register.usernameRequired")
    if not email:
        raise AppError("auth.register.emailRequired")
    if not await verify_code(redis, email, code):
        raise AppError("auth.register.invalidCode")
    _validate_password_strength(password)
    username_result = await db.execute(_exclude_archived_users(select(User).where(func.lower(User.username) == username)))
    if username_result.scalar_one_or_none():
        raise AppError("auth.register.usernameExists")
    email_result = await db.execute(_exclude_archived_users(select(User).where(func.lower(User.email) == email)))
    if email_result.scalar_one_or_none():
        raise AppError("auth.register.emailExists")
    valid_invite_code = await validate_invite_code(db, invite_code)
    user = User(
        username=username,
        email=email,
        password_hash=_hash_password(password),
        email_verified=True,
        invited_by_code=normalize_invite_code(invite_code),
        invited_by_user_id=valid_invite_code.owner_user_id,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise _map_register_integrity_error(exc) from exc

    from backend.services.quota_service import (
        ensure_invite_bonus,
        ensure_signup_bonus,
        ensure_signup_pro_trial_subscription,
    )

    await ensure_signup_bonus(db, user.id)
    await ensure_invite_bonus(db, user.id)
    await ensure_signup_pro_trial_subscription(db, user.id)
    await mark_invite_code_used(db, valid_invite_code, used_by_user_id=user.id)
    return user


def _verify_google_oauth_id_token(id_token: str) -> dict:
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise AppError("auth.google.notConfigured", status_code=503)
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except Exception as exc:
        raise AppError("auth.google.notConfigured", status_code=503) from exc
    try:
        payload = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as exc:
        raise AppError("auth.google.invalidToken", status_code=401) from exc
    if payload.get("iss") not in {"https://accounts.google.com", "accounts.google.com"}:
        raise AppError("auth.google.invalidToken", status_code=401)
    return payload


async def _generate_unique_username(db: AsyncSession, seed: str) -> str:
    base = _normalize_username_seed(seed)
    normalized_username = func.lower(func.trim(func.coalesce(User.username, "")))
    for index in range(200):
        suffix = "" if index == 0 else f"-{index + 1}"
        candidate = f"{base[: max(64 - len(suffix), 1)]}{suffix}"
        exists = await db.execute(_exclude_archived_users(select(User.id).where(normalized_username == candidate)))
        if exists.scalar_one_or_none() is None:
            return candidate
    return f"user-{secrets.token_hex(4)}"


async def authenticate_google_user(
    db: AsyncSession,
    *,
    id_token: str,
    invite_code: str | None = None,
) -> User:
    payload = _verify_google_oauth_id_token(id_token)
    email = _normalize_auth_identity(str(payload.get("email") or ""))
    if not email:
        raise AppError("auth.google.emailUnavailable", status_code=400)
    if payload.get("email_verified") is not True:
        raise AppError("auth.google.emailUnavailable", status_code=400)

    normalized_email = func.lower(func.trim(func.coalesce(User.email, "")))
    user_result = await db.execute(_exclude_archived_users(select(User).where(normalized_email == email)))
    user = user_result.scalar_one_or_none()
    if user is not None:
        if not user.is_active():
            raise AppError("auth.google.accountUnavailable", status_code=403)
        user.email_verified = True
        # Backfill historical accounts that may miss signup bonus package.
        from backend.services.quota_service import ensure_signup_bonus

        await ensure_signup_bonus(db, user.id)
        return user

    seed = str(payload.get("name") or email.split("@", 1)[0] or "user")
    username = await _generate_unique_username(db, seed)
    normalized_invite_code = normalize_invite_code(invite_code or "")
    valid_invite_code = None
    if normalized_invite_code:
        valid_invite_code = await validate_invite_code(db, normalized_invite_code)
    user = User(
        username=username,
        email=email,
        password_hash=_hash_password(secrets.token_urlsafe(24)),
        email_verified=True,
        invited_by_code=normalized_invite_code or None,
        invited_by_user_id=valid_invite_code.owner_user_id if valid_invite_code is not None else None,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise _map_register_integrity_error(exc) from exc

    from backend.services.quota_service import (
        ensure_invite_bonus,
        ensure_signup_bonus,
        ensure_signup_pro_trial_subscription,
    )

    await ensure_signup_bonus(db, user.id)
    if valid_invite_code is not None:
        await ensure_invite_bonus(db, user.id)
    await ensure_signup_pro_trial_subscription(db, user.id)
    if valid_invite_code is not None:
        await mark_invite_code_used(db, valid_invite_code, used_by_user_id=user.id)
    return user


def _map_register_integrity_error(exc: IntegrityError) -> AppError:
    message = str(exc).lower()
    if "ix_users_username" in message or "users_username_key" in message:
        return AppError("auth.register.usernameExists")
    if "ix_users_email" in message or "users_email_key" in message:
        return AppError("auth.register.emailExists")
    return AppError("common.serverError", status_code=500)


async def authenticate_user(
    db: AsyncSession,
    username_or_email: str,
    password: str,
    *,
    allow_root: bool = True,
    allow_root_when_test_account_disabled: bool = False,
) -> User | None:
    """用户名或邮箱 + 密码 校验"""
    normalized_identity = _normalize_auth_identity(username_or_email)
    normalized_username = func.lower(func.trim(func.coalesce(User.username, "")))
    normalized_email = func.lower(func.trim(func.coalesce(User.email, "")))

    # Prefer username match first, then fallback to email.
    # This avoids ambiguity and tolerates historical whitespace/case dirty data.
    username_stmt = _exclude_archived_users(select(User).where(normalized_username == normalized_identity))
    user = (await db.execute(username_stmt)).scalar_one_or_none()
    if user is None:
        email_stmt = _exclude_archived_users(select(User).where(normalized_email == normalized_identity))
        user = (await db.execute(email_stmt)).scalar_one_or_none()

    if not user or not user.is_active():
        return None
    if user.username == "root":
        if not allow_root:
            return None
        if not settings.ENABLE_TEST_ACCOUNT and not allow_root_when_test_account_disabled:
            return None
    if not _verify_password(password, user.password_hash):
        return None
    return user


async def reset_password(
    db: AsyncSession,
    redis: Redis,
    email: str,
    code: str,
    new_password: str,
) -> None:
    email = _normalize_auth_identity(email)
    if not await verify_code(redis, email, code):
        raise AppError("auth.resetPassword.invalidCode")
    result = await db.execute(_exclude_archived_users(select(User).where(func.lower(User.email) == email)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active():
        raise AppError("auth.resetPassword.userNotFound", status_code=404)
    _validate_password_strength(new_password)
    user.password_hash = _hash_password(new_password)
    user.email_verified = True


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

