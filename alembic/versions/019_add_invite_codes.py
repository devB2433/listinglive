"""add invite codes

Revision ID: 019_add_invite_codes
Revises: 018_default_user_language_to_en
Create Date: 2026-03-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "019_add_invite_codes"
down_revision: Union[str, None] = "018_default_user_language_to_en"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invite_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invite_codes_code"), "invite_codes", ["code"], unique=True)
    op.create_index(op.f("ix_invite_codes_owner_user_id"), "invite_codes", ["owner_user_id"], unique=True)
    op.create_index(op.f("ix_invite_codes_created_by_user_id"), "invite_codes", ["created_by_user_id"], unique=False)

    op.add_column("users", sa.Column("invited_by_code", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_users_invited_by_user_id_users", "users", "users", ["invited_by_user_id"], ["id"])
    op.create_index(op.f("ix_users_invited_by_user_id"), "users", ["invited_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_invited_by_user_id"), table_name="users")
    op.drop_constraint("fk_users_invited_by_user_id_users", "users", type_="foreignkey")
    op.drop_column("users", "invited_by_user_id")
    op.drop_column("users", "invited_by_code")

    op.drop_index(op.f("ix_invite_codes_created_by_user_id"), table_name="invite_codes")
    op.drop_index(op.f("ix_invite_codes_owner_user_id"), table_name="invite_codes")
    op.drop_index(op.f("ix_invite_codes_code"), table_name="invite_codes")
    op.drop_table("invite_codes")
