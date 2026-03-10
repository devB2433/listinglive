"""add flex video task fields

Revision ID: 016
Revises: 015
Create Date: 2026-03-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "video_tasks",
        sa.Column("service_tier", sa.String(length=16), nullable=False, server_default="standard"),
    )
    op.add_column("video_tasks", sa.Column("provider_task_id", sa.String(length=255), nullable=True))
    op.add_column("video_tasks", sa.Column("provider_status", sa.String(length=64), nullable=True))
    op.add_column("video_tasks", sa.Column("provider_submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("video_tasks", sa.Column("provider_last_polled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("video_tasks", sa.Column("provider_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("video_tasks", sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_video_tasks_service_tier"), "video_tasks", ["service_tier"], unique=False)
    op.create_index(op.f("ix_video_tasks_provider_task_id"), "video_tasks", ["provider_task_id"], unique=False)
    op.create_index(op.f("ix_video_tasks_next_poll_at"), "video_tasks", ["next_poll_at"], unique=False)
    op.alter_column("video_tasks", "service_tier", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_video_tasks_next_poll_at"), table_name="video_tasks")
    op.drop_index(op.f("ix_video_tasks_provider_task_id"), table_name="video_tasks")
    op.drop_index(op.f("ix_video_tasks_service_tier"), table_name="video_tasks")
    op.drop_column("video_tasks", "next_poll_at")
    op.drop_column("video_tasks", "provider_completed_at")
    op.drop_column("video_tasks", "provider_last_polled_at")
    op.drop_column("video_tasks", "provider_submitted_at")
    op.drop_column("video_tasks", "provider_status")
    op.drop_column("video_tasks", "provider_task_id")
    op.drop_column("video_tasks", "service_tier")
