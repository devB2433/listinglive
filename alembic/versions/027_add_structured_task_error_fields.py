"""add structured task error fields

Revision ID: 027_structured_task_errors
Revises: 026_add_overlay_position_fields
Create Date: 2026-03-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "027_structured_task_errors"
down_revision: Union[str, None] = "026_add_overlay_position_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("video_tasks", sa.Column("error_code", sa.String(length=128), nullable=True))
    op.add_column("video_tasks", sa.Column("error_source", sa.String(length=32), nullable=True))
    op.add_column("video_tasks", sa.Column("error_detail", sa.Text(), nullable=True))
    op.add_column("video_tasks", sa.Column("error_retryable", sa.Boolean(), nullable=True))

    op.add_column("long_video_segments", sa.Column("error_code", sa.String(length=128), nullable=True))
    op.add_column("long_video_segments", sa.Column("error_source", sa.String(length=32), nullable=True))
    op.add_column("long_video_segments", sa.Column("error_detail", sa.Text(), nullable=True))
    op.add_column("long_video_segments", sa.Column("error_retryable", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("long_video_segments", "error_retryable")
    op.drop_column("long_video_segments", "error_detail")
    op.drop_column("long_video_segments", "error_source")
    op.drop_column("long_video_segments", "error_code")

    op.drop_column("video_tasks", "error_retryable")
    op.drop_column("video_tasks", "error_detail")
    op.drop_column("video_tasks", "error_source")
    op.drop_column("video_tasks", "error_code")
