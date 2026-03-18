"""fix archived identity indexes

Revision ID: 029_fix_archived_indexes
Revises: 028_archive_users
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "029_fix_archived_indexes"
down_revision: Union[str, None] = "028_archive_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NORMALIZED_ARCHIVED = "lower(trim(coalesce(status, ''))) = 'archived'"
_ACTIVE_FILTER = "lower(trim(coalesce(status, ''))) <> 'archived'"


def upgrade() -> None:
    # 归一化历史脏数据，避免索引条件与业务条件不一致。
    op.execute(
        sa.text(
            f"""
            UPDATE users
            SET status = 'archived'
            WHERE {_NORMALIZED_ARCHIVED}
              AND status <> 'archived'
            """
        )
    )

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.create_index(
        op.f("ix_users_email"),
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE_FILTER),
    )
    op.create_index(
        op.f("ix_users_username"),
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE_FILTER),
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(
        op.f("ix_users_email"),
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("status <> 'archived'"),
    )
    op.create_index(
        op.f("ix_users_username"),
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("status <> 'archived'"),
    )
