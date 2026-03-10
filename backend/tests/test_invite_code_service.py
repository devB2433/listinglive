import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.core.api_errors import AppError
from backend.models.invite_code import InviteCode
from backend.services.invite_code_service import (
    create_admin_invite_code,
    create_user_invite_code,
    mark_invite_code_used,
    normalize_invite_code,
    validate_invite_code,
)


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class InviteCodeServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize_invite_code(self) -> None:
        self.assertEqual(normalize_invite_code(" invite88 "), "INVITE88")

    async def test_create_user_invite_code_rejects_second_code(self) -> None:
        existing = InviteCode(code="INVITE88", owner_user_id="user-1", created_by_user_id="user-1", is_active=True)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(existing))

        with self.assertRaises(AppError) as context:
            await create_user_invite_code(db, owner_user_id="user-1", created_by_user_id="user-1")

        self.assertEqual(context.exception.code, "inviteCodes.alreadyExists")

    async def test_create_user_invite_code_creates_record(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(None))
        db.flush = AsyncMock()
        db.add = lambda instance: None

        with patch("backend.services.invite_code_service.generate_invite_code_value", AsyncMock(return_value="ABCD2345")):
            invite_code = await create_user_invite_code(db, owner_user_id="user-1", created_by_user_id="user-1")

        self.assertEqual(invite_code.code, "ABCD2345")
        self.assertEqual(invite_code.owner_user_id, "user-1")

    async def test_validate_invite_code_rejects_missing_code(self) -> None:
        db = AsyncMock()

        with self.assertRaises(AppError) as context:
            await validate_invite_code(db, " ")

        self.assertEqual(context.exception.code, "auth.register.inviteCodeRequired")

    async def test_validate_invite_code_rejects_unknown_code(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(None))

        with self.assertRaises(AppError) as context:
            await validate_invite_code(db, "missing88")

        self.assertEqual(context.exception.code, "auth.register.inviteCodeInvalid")

    async def test_validate_invite_code_rejects_disabled_code(self) -> None:
        invite_code = SimpleNamespace(is_active=False)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(invite_code))

        with self.assertRaises(AppError) as context:
            await validate_invite_code(db, "invite88")

        self.assertEqual(context.exception.code, "auth.register.inviteCodeDisabled")

    async def test_validate_invite_code_accepts_enabled_code(self) -> None:
        invite_code = SimpleNamespace(code="INVITE88", is_active=True, owner_user_id="owner-1")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(invite_code))

        result = await validate_invite_code(db, "invite88")

        self.assertIs(result, invite_code)

    async def test_create_admin_invite_code_allows_unlimited_unowned_codes(self) -> None:
        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = lambda instance: None

        with patch("backend.services.invite_code_service.generate_invite_code_value", AsyncMock(return_value="ADMIN888")):
            invite_code = await create_admin_invite_code(db, created_by_user_id="root-id", owner_user_id=None)

        self.assertEqual(invite_code.code, "ADMIN888")
        self.assertIsNone(invite_code.owner_user_id)

    async def test_validate_invite_code_rejects_used_admin_code(self) -> None:
        invite_code = SimpleNamespace(code="ADMIN888", is_active=True, owner_user_id=None, used_by_user_id="user-1")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_FakeResult(invite_code))

        with self.assertRaises(AppError) as context:
            await validate_invite_code(db, "admin888")

        self.assertEqual(context.exception.code, "auth.register.inviteCodeUsed")

    async def test_mark_invite_code_used_marks_admin_code_once(self) -> None:
        invite_code = InviteCode(code="ADMIN888", owner_user_id=None, created_by_user_id="root-id", is_active=True)
        db = AsyncMock()
        db.flush = AsyncMock()

        await mark_invite_code_used(db, invite_code, used_by_user_id="user-1")

        self.assertEqual(invite_code.used_by_user_id, "user-1")
        self.assertIsNotNone(invite_code.used_at)


if __name__ == "__main__":
    unittest.main()
