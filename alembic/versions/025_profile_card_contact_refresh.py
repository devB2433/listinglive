"""add profile card slogan and contact fields

Revision ID: 025_profile_card_contact_refresh
Revises: 024_profile_card_templates
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "025_profile_card_contact_refresh"
down_revision: Union[str, None] = "024_profile_card_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profile_cards",
        sa.Column("slogan", sa.String(length=160), nullable=False, server_default=""),
    )
    op.add_column(
        "profile_cards",
        sa.Column("homepage", sa.String(length=255), nullable=False, server_default=""),
    )
    op.add_column(
        "profile_cards",
        sa.Column("email", sa.String(length=255), nullable=False, server_default=""),
    )
    op.alter_column("profile_cards", "slogan", server_default=None)
    op.alter_column("profile_cards", "homepage", server_default=None)
    op.alter_column("profile_cards", "email", server_default=None)


def downgrade() -> None:
    op.drop_column("profile_cards", "email")
    op.drop_column("profile_cards", "homepage")
    op.drop_column("profile_cards", "slogan")
