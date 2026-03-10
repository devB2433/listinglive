"""
管理员 MFA 服务（TOTP / Google Authenticator）
"""
from datetime import datetime, timezone
from io import BytesIO

import pyotp
import qrcode
import qrcode.image.svg
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.models.user import User

ADMIN_TOTP_ISSUER = "ListingLive Admin"


def is_admin_mfa_required(user: User) -> bool:
    return user.username == "root" and bool(user.admin_totp_enabled and user.admin_totp_secret)


def get_admin_mfa_status(user: User) -> dict:
    return {
        "enabled": bool(user.admin_totp_enabled),
        "configured": bool(user.admin_totp_secret),
        "confirmed_at": user.admin_totp_confirmed_at,
    }


def _build_totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret)


def _build_qr_svg(uri: str) -> str:
    image = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
    buffer = BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode("utf-8")


async def prepare_admin_mfa_setup(db: AsyncSession, user: User) -> dict:
    if user.username != "root":
        raise AppError("admin.mfa.notSupported", status_code=403)

    if not user.admin_totp_secret:
        user.admin_totp_secret = pyotp.random_base32()
        user.admin_totp_enabled = False
        user.admin_totp_confirmed_at = None
        await db.flush()

    secret = user.admin_totp_secret
    assert secret is not None
    totp = _build_totp(secret)
    otpauth_url = totp.provisioning_uri(name=user.email, issuer_name=ADMIN_TOTP_ISSUER)
    return {
        "secret": secret,
        "otpauth_url": otpauth_url,
        "qr_svg": _build_qr_svg(otpauth_url),
    }


def verify_admin_totp_code(user: User, code: str | None) -> None:
    if not is_admin_mfa_required(user):
        return
    if not code:
        raise AppError("admin.login.mfaCodeRequired", status_code=401)
    if not user.admin_totp_secret:
        raise AppError("admin.login.mfaNotConfigured", status_code=401)
    if not _build_totp(user.admin_totp_secret).verify(code, valid_window=1):
        raise AppError("admin.login.invalidMfaCode", status_code=401)


async def enable_admin_mfa(db: AsyncSession, user: User, code: str) -> dict:
    if user.username != "root":
        raise AppError("admin.mfa.notSupported", status_code=403)
    if not user.admin_totp_secret:
        await prepare_admin_mfa_setup(db, user)
    secret = user.admin_totp_secret
    assert secret is not None
    if not _build_totp(secret).verify(code, valid_window=1):
        raise AppError("admin.mfa.invalidCode")
    user.admin_totp_enabled = True
    user.admin_totp_confirmed_at = datetime.now(timezone.utc)
    await db.flush()
    return get_admin_mfa_status(user)


async def disable_admin_mfa(db: AsyncSession, user: User, code: str) -> dict:
    if user.username != "root":
        raise AppError("admin.mfa.notSupported", status_code=403)
    if not user.admin_totp_secret or not user.admin_totp_enabled:
        raise AppError("admin.mfa.notEnabled")
    if not _build_totp(user.admin_totp_secret).verify(code, valid_window=1):
        raise AppError("admin.mfa.invalidCode")
    user.admin_totp_enabled = False
    user.admin_totp_secret = None
    user.admin_totp_confirmed_at = None
    await db.flush()
    return get_admin_mfa_status(user)
