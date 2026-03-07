"""add scene template category

Revision ID: 009
Revises: 008
Create Date: 2026-03-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scene_templates", sa.Column("category", sa.String(length=32), nullable=True))
    op.execute(sa.text("UPDATE scene_templates SET category = 'short' WHERE category IS NULL"))
    op.alter_column("scene_templates", "category", nullable=False, server_default="short")
    op.create_index(op.f("ix_scene_templates_category"), "scene_templates", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scene_templates_category"), table_name="scene_templates")
    op.drop_column("scene_templates", "category")
