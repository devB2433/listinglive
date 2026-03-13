import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from backend.core.api_errors import AppError
from backend.models.user import User, UserStatus
from backend.services.admin_user_service import admin_reset_user_password, archive_user, block_user, unblock_user


class AdminUserServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_block_user_rejects_root(self) -> None:
        user = User(
            username="root",
            email="root@example.com",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)

        with self.assertRaises(AppError) as context:
            await block_user(db, "root-id")

        self.assertEqual(context.exception.code, "admin.users.cannotBlockRoot")

    async def test_archive_user_rejects_root(self) -> None:
        user = User(
            username="root",
            email="root@example.com",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)

        with self.assertRaises(AppError) as context:
            await archive_user(db, user_id="root-id", archived_by_user_id="admin-id")

        self.assertEqual(context.exception.code, "admin.users.cannotArchiveRoot")

    async def test_archive_user_sets_archived_state_and_audit_fields(self) -> None:
        user = User(
            username="demo",
            email="demo@example.com",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status=UserStatus.ACTIVE.value,
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)

        archived = await archive_user(db, user_id="user-id", archived_by_user_id="admin-id")

        self.assertIs(archived, user)
        self.assertEqual(user.status, UserStatus.ARCHIVED.value)
        self.assertEqual(user.archived_by_user_id, "admin-id")
        self.assertIsInstance(user.archived_at, datetime)
        self.assertEqual(user.archived_at.tzinfo, timezone.utc)

    async def test_unblock_user_rejects_archived_account(self) -> None:
        user = User(
            username="demo",
            email="demo@example.com",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status=UserStatus.ARCHIVED.value,
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)

        with self.assertRaises(AppError) as context:
            await unblock_user(db, "user-id")

        self.assertEqual(context.exception.code, "admin.users.archivedReadOnly")

    async def test_reset_password_rejects_archived_account(self) -> None:
        user = User(
            username="demo",
            email="demo@example.com",
            password_hash="hash",
            email_verified=True,
            preferred_language="en",
            status=UserStatus.ARCHIVED.value,
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)

        with self.assertRaises(AppError) as context:
            await admin_reset_user_password(db, "user-id", new_password="Password!1")

        self.assertEqual(context.exception.code, "admin.users.archivedReadOnly")


if __name__ == "__main__":
    unittest.main()
