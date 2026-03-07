"""add video tasks and scene templates

Revision ID: 004
Revises: 003
Create Date: 2026-03-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scene_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "video_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_type", sa.String(length=32), nullable=False, server_default="short"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("image_keys", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("resolution", sa.String(length=32), nullable=False),
        sa.Column("aspect_ratio", sa.String(length=32), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("logo_key", sa.String(length=255), nullable=True),
        sa.Column("quota_consumed", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("provider_name", sa.String(length=32), nullable=True),
        sa.Column("provider_task_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("video_key", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["scene_template_id"], ["scene_templates.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_video_tasks_user_id"), "video_tasks", ["user_id"], unique=False)
    op.create_index(op.f("ix_video_tasks_scene_template_id"), "video_tasks", ["scene_template_id"], unique=False)

def downgrade() -> None:
    op.drop_index(op.f("ix_video_tasks_scene_template_id"), table_name="video_tasks")
    op.drop_index(op.f("ix_video_tasks_user_id"), table_name="video_tasks")
    op.drop_table("video_tasks")
    op.drop_table("scene_templates")
