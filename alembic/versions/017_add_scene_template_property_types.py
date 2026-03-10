"""add scene template property types

Revision ID: 017
Revises: 016
Create Date: 2026-03-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scene_templates",
        sa.Column(
            "property_types",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("scene_templates", "property_types", server_default=None)


def downgrade() -> None:
    op.drop_column("scene_templates", "property_types")
