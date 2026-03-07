"""seed root test user

Revision ID: 002
Revises: 001
Create Date: 2026-03-06

"""
from typing import Sequence, Union
import uuid

import bcrypt
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pwd_hash = bcrypt.hashpw(b"root", bcrypt.gensalt()).decode()
    uid = uuid.uuid4()
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            INSERT INTO users (id, username, email, password_hash, email_verified, status)
            VALUES (:id, 'root', 'root@localhost', :pwd_hash, true, 'active')
            ON CONFLICT (username) DO NOTHING
        """),
        {"id": uid, "pwd_hash": pwd_hash},
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM users WHERE username = 'root'"))
