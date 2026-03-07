"""add scene template key

Revision ID: 005
Revises: 004
Create Date: 2026-03-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scene_templates", sa.Column("template_key", sa.String(length=64), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE scene_templates
            SET template_key = CASE name
                WHEN '客厅推镜' THEN 'living_push'
                WHEN '厨房环视' THEN 'kitchen_pan'
                WHEN '卧室漫游' THEN 'bedroom_tour'
                ELSE 'legacy_' || substring(replace(id::text, '-', '') from 1 for 16)
            END
            """
        )
    )

    op.alter_column("scene_templates", "template_key", nullable=False)
    op.create_index(op.f("ix_scene_templates_template_key"), "scene_templates", ["template_key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_scene_templates_template_key"), table_name="scene_templates")
    op.drop_column("scene_templates", "template_key")
