"""archive users and reuse identity

Revision ID: 028_archive_users
Revises: 027_structured_task_errors
Create Date: 2026-03-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "028_archive_users"
down_revision: Union[str, None] = "027_structured_task_errors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("archived_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f("ix_users_archived_by_user_id"), "users", ["archived_by_user_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_users_archived_by_user_id_users"),
        "users",
        "users",
        ["archived_by_user_id"],
        ["id"],
    )

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
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


def downgrade() -> None:
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.drop_constraint(op.f("fk_users_archived_by_user_id_users"), "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_archived_by_user_id"), table_name="users")
    op.drop_column("users", "archived_by_user_id")
    op.drop_column("users", "archived_at")
