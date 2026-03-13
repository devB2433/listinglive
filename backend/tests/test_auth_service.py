import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from backend.core.api_errors import AppError
from backend.models.invite_code import InviteCode
from backend.models.user import User
from backend.services.admin_mfa_service import verify_admin_totp_code
from backend.services.auth_service import authenticate_user, register, reset_password, send_verify_code, verify_code


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class AuthServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_and_verify_code_normalize_email_to_lowercase(self) -> None:
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.setex = AsyncMock()
        redis.delete = AsyncMock()

        code = await send_verify_code(redis, " Demo@Example.COM ")

        redis.setex.assert_any_call("verify_code:demo@example.com", unittest.mock.ANY, code)
        redis.setex.assert_any_call("verify_rate:demo@example.com", unittest.mock.ANY, "1")

        redis.get = AsyncMock(return_value=code)
        verified = await verify_code(redis, "demo@example.com", code)

        self.assertTrue(verified)
        redis.delete.assert_awaited_once_with("verify_code:demo@example.com")

    async def test_register_rejects_duplicate_username(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_FakeResult(SimpleNamespace(id="u1"))])
        redis = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            with self.assertRaises(AppError) as context:
                await register(db, redis, "existing-user", "Password!1", "new@example.com", "123456", "INVITE88")

        self.assertEqual(context.exception.code, "auth.register.usernameExists")

    async def test_register_rejects_duplicate_email(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_FakeResult(None), _FakeResult(SimpleNamespace(id="u2"))])
        redis = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            with self.assertRaises(AppError) as context:
                await register(db, redis, "new-user", "Password!1", "existing@example.com", "123456", "INVITE88")

        self.assertEqual(context.exception.code, "auth.register.emailExists")

    async def test_register_normalizes_username_and_email_to_lowercase(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_FakeResult(None), _FakeResult(None)])
        db.flush = AsyncMock()
        db.add = Mock()
        redis = AsyncMock()
        invite_code = InviteCode(code="INVITE88", owner_user_id=None, created_by_user_id="root-id", is_active=True)

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            with patch("backend.services.auth_service.validate_invite_code", AsyncMock(return_value=invite_code)):
                with patch("backend.services.quota_service.ensure_signup_bonus", AsyncMock()):
                    with patch("backend.services.quota_service.ensure_invite_bonus", AsyncMock()):
                        with patch("backend.services.quota_service.ensure_signup_pro_trial_subscription", AsyncMock()):
                            user = await register(
                                db,
                                redis,
                                " DemoUser ",
                                "Password!1",
                                " Demo@Example.COM ",
                                "123456",
                                " invite88 ",
                            )

        self.assertEqual(user.username, "demouser")
        self.assertEqual(user.email, "demo@example.com")
        self.assertEqual(user.invited_by_code, "INVITE88")
        db.add.assert_called_once()

    async def test_register_creates_signup_pro_trial_subscription(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_FakeResult(None), _FakeResult(None)])
        db.flush = AsyncMock()
        db.add = Mock()
        redis = AsyncMock()
        invite_code = InviteCode(code="INVITE88", owner_user_id=None, created_by_user_id="root-id", is_active=True)
        ensure_trial = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            with patch("backend.services.auth_service.validate_invite_code", AsyncMock(return_value=invite_code)):
                with patch("backend.services.quota_service.ensure_signup_bonus", AsyncMock()):
                    with patch("backend.services.quota_service.ensure_invite_bonus", AsyncMock()):
                        with patch("backend.services.quota_service.ensure_signup_pro_trial_subscription", ensure_trial):
                            user = await register(
                                db,
                                redis,
                                "new-user",
                                "Password!1",
                                "new@example.com",
                                "123456",
                                "INVITE88",
                            )

        ensure_trial.assert_awaited_once_with(db, user.id)

    async def test_authenticate_user_matches_case_insensitive_identity(self) -> None:
        db = AsyncMock()
        user = User(
            username="demouser",
            email="demo@example.com",
            password_hash="stored-hash",
            email_verified=True,
            preferred_language="zh-CN",
            status="active",
        )
        db.execute = AsyncMock(return_value=_FakeResult(user))

        with patch("backend.services.auth_service._verify_password", return_value=True):
            authenticated = await authenticate_user(db, " DemoUser ", "Password!1")

        self.assertIs(authenticated, user)

    async def test_authenticate_user_rejects_root_when_not_allowed(self) -> None:
        db = AsyncMock()
        user = User(
            username="root",
            email="root@localhost",
            password_hash="stored-hash",
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db.execute = AsyncMock(return_value=_FakeResult(user))

        with patch("backend.services.auth_service._verify_password", return_value=True):
            authenticated = await authenticate_user(db, "root", "Password!1", allow_root=False)

        self.assertIsNone(authenticated)

    async def test_authenticate_user_allows_root_for_admin_login_when_test_account_disabled(self) -> None:
        db = AsyncMock()
        user = User(
            username="root",
            email="root@localhost",
            password_hash="stored-hash",
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db.execute = AsyncMock(return_value=_FakeResult(user))

        with patch("backend.services.auth_service._verify_password", return_value=True):
            with patch("backend.services.auth_service.settings", SimpleNamespace(ENABLE_TEST_ACCOUNT=False)):
                authenticated = await authenticate_user(
                    db,
                    "root",
                    "Password!1",
                    allow_root=True,
                    allow_root_when_test_account_disabled=True,
                )

        self.assertIs(authenticated, user)

    def test_admin_mfa_verify_is_skipped_when_not_enabled(self) -> None:
        user = User(
            username="root",
            email="root@localhost",
            password_hash="stored-hash",
            email_verified=True,
            preferred_language="en",
            status="active",
            admin_totp_secret=None,
            admin_totp_enabled=False,
        )

        verify_admin_totp_code(user, None)

    async def test_reset_password_rejects_invalid_code(self) -> None:
        db = AsyncMock()
        redis = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=False)):
            with self.assertRaises(AppError) as context:
                await reset_password(db, redis, "user@example.com", "123456", "Password!1")

        self.assertEqual(context.exception.code, "auth.resetPassword.invalidCode")

    async def test_reset_password_rejects_unknown_email(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(None))
        redis = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            with self.assertRaises(AppError) as context:
                await reset_password(db, redis, "missing@example.com", "123456", "Password!1")

        self.assertEqual(context.exception.code, "auth.resetPassword.userNotFound")

    async def test_reset_password_updates_user_password_hash(self) -> None:
        user = User(
            username="demo-user",
            email="demo@example.com",
            password_hash="old-hash",
            email_verified=False,
            preferred_language="zh-CN",
            status="active",
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(user))
        redis = AsyncMock()

        with patch("backend.services.auth_service.verify_code", AsyncMock(return_value=True)):
            await reset_password(db, redis, "demo@example.com", "123456", "Password!1")

        self.assertNotEqual(user.password_hash, "old-hash")
        self.assertTrue(user.email_verified)


if __name__ == "__main__":
    unittest.main()
