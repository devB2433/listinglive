"""add video task timing fields

Revision ID: 011
Revises: 010
Create Date: 2026-03-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "video_tasks",
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
    )
    op.add_column(
        "video_tasks",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "video_tasks",
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute("UPDATE video_tasks SET queued_at = COALESCE(queued_at, created_at)")
    op.execute(
        """
        UPDATE video_tasks
        SET processing_started_at = CASE
            WHEN status IN ('processing', 'merging', 'succeeded', 'failed') THEN COALESCE(updated_at, created_at)
            ELSE NULL
        END
        """
    )
    op.execute(
        """
        UPDATE video_tasks
        SET finished_at = CASE
            WHEN status IN ('succeeded', 'failed') THEN COALESCE(updated_at, created_at)
            ELSE NULL
        END
        """
    )

    op.alter_column("video_tasks", "queued_at", nullable=False, existing_type=sa.DateTime(timezone=True))


def downgrade() -> None:
    op.drop_column("video_tasks", "finished_at")
    op.drop_column("video_tasks", "processing_started_at")
    op.drop_column("video_tasks", "queued_at")
