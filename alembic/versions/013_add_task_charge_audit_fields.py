"""add task charge audit fields

Revision ID: 013
Revises: 012
Create Date: 2026-03-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "video_tasks",
        sa.Column("planned_quota_consumed", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "video_tasks",
        sa.Column("charged_quota_consumed", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "video_tasks",
        sa.Column("charge_status", sa.String(length=32), nullable=False, server_default="pending"),
    )
    op.add_column(
        "video_tasks",
        sa.Column("charged_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(
        """
        UPDATE video_tasks
        SET planned_quota_consumed = COALESCE(quota_consumed, 0)
        """
    )
    op.execute(
        """
        UPDATE video_tasks
        SET
            charged_quota_consumed = CASE
                WHEN quota_refunded_at IS NOT NULL THEN 0
                WHEN status = 'succeeded' THEN COALESCE(quota_consumed, 0)
                WHEN status IN ('queued', 'processing', 'merging', 'failed') THEN COALESCE(quota_consumed, 0)
                ELSE 0
            END,
            charge_status = CASE
                WHEN quota_refunded_at IS NOT NULL THEN 'skipped'
                WHEN COALESCE(quota_consumed, 0) > 0 THEN 'charged'
                ELSE 'pending'
            END,
            charged_at = CASE
                WHEN quota_refunded_at IS NOT NULL THEN NULL
                WHEN COALESCE(quota_consumed, 0) > 0 THEN COALESCE(finished_at, updated_at, created_at)
                ELSE NULL
            END
        """
    )

    op.alter_column("video_tasks", "planned_quota_consumed", server_default=None)
    op.alter_column("video_tasks", "charged_quota_consumed", server_default=None)
    op.alter_column("video_tasks", "charge_status", server_default=None)


def downgrade() -> None:
    op.drop_column("video_tasks", "charged_at")
    op.drop_column("video_tasks", "charge_status")
    op.drop_column("video_tasks", "charged_quota_consumed")
    op.drop_column("video_tasks", "planned_quota_consumed")
