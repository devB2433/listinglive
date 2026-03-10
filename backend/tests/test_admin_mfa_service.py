import unittest
from unittest.mock import AsyncMock

import pyotp

from backend.core.api_errors import AppError
from backend.models.user import User
from backend.services.admin_mfa_service import enable_admin_mfa, prepare_admin_mfa_setup, verify_admin_totp_code


class AdminMfaServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_prepare_admin_mfa_setup_generates_secret_and_qr(self) -> None:
        user = User(
            username="root",
            email="root@localhost",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db = AsyncMock()
        db.flush = AsyncMock()

        result = await prepare_admin_mfa_setup(db, user)

        self.assertTrue(result["secret"])
        self.assertIn("otpauth://", result["otpauth_url"])
        self.assertIn("<svg", result["qr_svg"])

    async def test_enable_admin_mfa_accepts_valid_totp_code(self) -> None:
        secret = pyotp.random_base32()
        user = User(
            username="root",
            email="root@localhost",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status="active",
            admin_totp_secret=secret,
            admin_totp_enabled=False,
        )
        db = AsyncMock()
        db.flush = AsyncMock()
        code = pyotp.TOTP(secret).now()

        result = await enable_admin_mfa(db, user, code)

        self.assertTrue(result["enabled"])
        self.assertTrue(user.admin_totp_enabled)

    def test_verify_admin_totp_code_requires_code_when_enabled(self) -> None:
        secret = pyotp.random_base32()
        user = User(
            username="root",
            email="root@localhost",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status="active",
            admin_totp_secret=secret,
            admin_totp_enabled=True,
        )

        with self.assertRaises(AppError) as context:
            verify_admin_totp_code(user, None)

        self.assertEqual(context.exception.code, "admin.login.mfaCodeRequired")


if __name__ == "__main__":
    unittest.main()
