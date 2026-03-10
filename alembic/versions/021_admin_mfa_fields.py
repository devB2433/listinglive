"""add admin mfa fields

Revision ID: 021_admin_mfa_fields
Revises: 020_admin_invite_code_usage
Create Date: 2026-03-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "021_admin_mfa_fields"
down_revision: Union[str, None] = "020_admin_invite_code_usage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_totp_secret", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("admin_totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("admin_totp_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("users", "admin_totp_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "admin_totp_confirmed_at")
    op.drop_column("users", "admin_totp_enabled")
    op.drop_column("users", "admin_totp_secret")
