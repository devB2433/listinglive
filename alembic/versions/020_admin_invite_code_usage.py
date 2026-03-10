"""add admin invite code usage fields

Revision ID: 020_admin_invite_code_usage
Revises: 019_add_invite_codes
Create Date: 2026-03-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "020_admin_invite_code_usage"
down_revision: Union[str, None] = "019_add_invite_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invite_codes", sa.Column("used_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("invite_codes", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_invite_codes_used_by_user_id_users",
        "invite_codes",
        "users",
        ["used_by_user_id"],
        ["id"],
    )
    op.create_index(op.f("ix_invite_codes_used_by_user_id"), "invite_codes", ["used_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_invite_codes_used_by_user_id"), table_name="invite_codes")
    op.drop_constraint("fk_invite_codes_used_by_user_id_users", "invite_codes", type_="foreignkey")
    op.drop_column("invite_codes", "used_at")
    op.drop_column("invite_codes", "used_by_user_id")
