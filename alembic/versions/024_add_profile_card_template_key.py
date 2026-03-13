"""add profile card template key

Revision ID: 024_profile_card_templates
Revises: 023_avatar_cards
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "024_profile_card_templates"
down_revision: Union[str, None] = "023_avatar_cards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profile_cards",
        sa.Column("template_key", sa.String(length=32), nullable=False, server_default="clean_light"),
    )
    op.execute("UPDATE profile_cards SET template_key = 'clean_light' WHERE template_key IS NULL")
    op.alter_column("profile_cards", "template_key", server_default=None)


def downgrade() -> None:
    op.drop_column("profile_cards", "template_key")
