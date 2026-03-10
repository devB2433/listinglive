"""default user preferred language to en

Revision ID: 018_default_user_language_to_en
Revises: 017
Create Date: 2026-03-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "018_default_user_language_to_en"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "preferred_language", server_default="en")


def downgrade() -> None:
    op.alter_column("users", "preferred_language", server_default="zh-CN")
