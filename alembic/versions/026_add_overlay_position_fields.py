"""add overlay position fields

Revision ID: 026_add_overlay_position_fields
Revises: 025_profile_card_contact_refresh
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "026_add_overlay_position_fields"
down_revision: Union[str, None] = "025_profile_card_contact_refresh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("video_tasks", sa.Column("logo_position_x", sa.Float(), nullable=True))
    op.add_column("video_tasks", sa.Column("logo_position_y", sa.Float(), nullable=True))
    op.add_column("video_tasks", sa.Column("avatar_position_x", sa.Float(), nullable=True))
    op.add_column("video_tasks", sa.Column("avatar_position_y", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("video_tasks", "avatar_position_y")
    op.drop_column("video_tasks", "avatar_position_x")
    op.drop_column("video_tasks", "logo_position_y")
    op.drop_column("video_tasks", "logo_position_x")
