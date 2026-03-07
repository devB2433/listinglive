"""add long video segments table

Revision ID: 007
Revises: 006
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "long_video_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("image_key", sa.String(length=255), nullable=False),
        sa.Column("scene_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("segment_video_key", sa.String(length=255), nullable=True),
        sa.Column("provider_task_id", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["task_id"], ["video_tasks.id"]),
        sa.ForeignKeyConstraint(["scene_template_id"], ["scene_templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_long_video_segments_task_id"), "long_video_segments", ["task_id"], unique=False)
    op.create_index(op.f("ix_long_video_segments_scene_template_id"), "long_video_segments", ["scene_template_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_long_video_segments_scene_template_id"), table_name="long_video_segments")
    op.drop_index(op.f("ix_long_video_segments_task_id"), table_name="long_video_segments")
    op.drop_table("long_video_segments")
