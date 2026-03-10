import unittest
from unittest.mock import AsyncMock

from backend.core.api_errors import AppError
from backend.models.user import User
from backend.services.admin_user_service import block_user


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


if __name__ == "__main__":
    unittest.main()
