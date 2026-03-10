#!/usr/bin/env python3
"""
重置 root 管理员密码。

推荐在生产容器内执行，例如：
docker compose --env-file /opt/listinglive/config/.env.prod -f /opt/listinglive/app/docker-compose.prod.yml \
  exec api python scripts/prod/reset_root_password.py 'NewPasswordHere'
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from backend.core.database import AsyncSessionLocal
from backend.models.user import User
from backend.services.auth_service import _hash_password, _validate_password_strength


async def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/prod/reset_root_password.py '<new-password>'")
        return 1

    new_password = sys.argv[1]
    _validate_password_strength(new_password)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "root"))
        user = result.scalar_one_or_none()
        if user is None:
            print("ERROR: root user not found.")
            return 1

        user.password_hash = _hash_password(new_password)
        user.email_verified = True
        await db.commit()

    print("root password updated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
