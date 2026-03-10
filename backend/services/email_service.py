"""
邮件发送服务：当前先提供 SMTP 发送能力。
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from backend.core.api_errors import AppError
from backend.core.config import settings

logger = logging.getLogger(__name__)


def _mail_provider() -> str:
    return settings.MAIL_PROVIDER.strip().lower()


def is_mail_delivery_enabled() -> bool:
    return _mail_provider() == "smtp" and bool(settings.MAIL_FROM and settings.SMTP_HOST)


def _build_from_header() -> str:
    if settings.MAIL_FROM_NAME:
        return f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    return settings.MAIL_FROM


def _build_verification_code_message(email: str, code: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = "Your ListingLive verification code"
    message["From"] = _build_from_header()
    message["To"] = email
    if settings.MAIL_REPLY_TO:
        message["Reply-To"] = settings.MAIL_REPLY_TO
    message.set_content(
        "\n".join(
            [
                "Hello,",
                "",
                f"Your ListingLive verification code is: {code}",
                f"This code will expire in {settings.VERIFY_CODE_EXPIRE_SECONDS // 60} minutes.",
                "",
                "If you did not request this code, you can ignore this email.",
                "",
                "ListingLive",
            ]
        )
    )
    return message


def _send_via_smtp(message: EmailMessage) -> None:
    timeout = settings.SMTP_TIMEOUT_SECONDS

    if settings.SMTP_USE_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout, context=context) as client:
            if settings.SMTP_USERNAME:
                client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")
            client.send_message(message)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout) as client:
        client.ehlo()
        if settings.SMTP_USE_TLS:
            context = ssl.create_default_context()
            client.starttls(context=context)
            client.ehlo()
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")
        client.send_message(message)


async def send_verification_code_email(email: str, code: str) -> None:
    if not is_mail_delivery_enabled():
        if settings.DEBUG:
            logger.info("Mail delivery is not configured; skipping SMTP send in debug mode.")
            return
        raise AppError("auth.sendCode.mailNotConfigured", status_code=503)

    message = _build_verification_code_message(email, code)
    try:
        await asyncio.to_thread(_send_via_smtp, message)
    except (smtplib.SMTPException, OSError) as exc:
        logger.exception("Failed to send verification email to %s: %s", email, exc)
        raise AppError("auth.sendCode.mailFailed", status_code=503) from exc
