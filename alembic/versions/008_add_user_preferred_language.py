"""add user preferred language

Revision ID: 008
Revises: 007
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferred_language", sa.String(length=16), nullable=True))
    op.execute(sa.text("UPDATE users SET preferred_language = 'zh-CN' WHERE preferred_language IS NULL"))
    op.alter_column("users", "preferred_language", nullable=False, server_default="zh-CN")


def downgrade() -> None:
    op.drop_column("users", "preferred_language")
