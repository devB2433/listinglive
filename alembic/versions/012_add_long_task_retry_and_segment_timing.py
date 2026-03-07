"""add long task retry and segment timing

Revision ID: 012
Revises: 011
Create Date: 2026-03-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "video_tasks",
        sa.Column("quota_refunded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "long_video_segments",
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
    )
    op.add_column(
        "long_video_segments",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "long_video_segments",
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute("UPDATE long_video_segments SET queued_at = COALESCE(queued_at, created_at)")
    op.execute(
        """
        UPDATE long_video_segments
        SET processing_started_at = CASE
            WHEN status IN ('processing', 'succeeded', 'failed') THEN COALESCE(updated_at, created_at)
            ELSE NULL
        END
        """
    )
    op.execute(
        """
        UPDATE long_video_segments
        SET finished_at = CASE
            WHEN status IN ('succeeded', 'failed') THEN COALESCE(updated_at, created_at)
            ELSE NULL
        END
        """
    )
    op.alter_column("long_video_segments", "queued_at", nullable=False, existing_type=sa.DateTime(timezone=True))


def downgrade() -> None:
    op.drop_column("long_video_segments", "finished_at")
    op.drop_column("long_video_segments", "processing_started_at")
    op.drop_column("long_video_segments", "queued_at")
    op.drop_column("video_tasks", "quota_refunded_at")
