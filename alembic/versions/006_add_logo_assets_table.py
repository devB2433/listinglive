"""add logo assets table

Revision ID: 006
Revises: 005
Create Date: 2026-03-06

"""
from typing import Sequence, Union
import uuid
from pathlib import Path

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "logo_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_logo_assets_user_id"), "logo_assets", ["user_id"], unique=False)
    op.create_index(op.f("ix_logo_assets_key"), "logo_assets", ["key"], unique=True)

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM users")).fetchall()
    for row in rows:
        user_id = row[0]
        base_dir = Path("data/storage") / "uploads" / str(user_id) / "logos"
        if not base_dir.exists():
            continue
        logo_paths = sorted(path for path in base_dir.rglob("*") if path.is_file())
        for index, logo_path in enumerate(logo_paths):
            key = logo_path.as_posix().split("data/storage/", 1)[-1]
            bind.execute(
                sa.text(
                    """
                    INSERT INTO logo_assets (id, user_id, key, display_name, is_default)
                    VALUES (:id, :user_id, :key, :display_name, :is_default)
                    ON CONFLICT (key) DO NOTHING
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "user_id": user_id,
                    "key": key,
                    "display_name": logo_path.name,
                    "is_default": index == 0,
                },
            )


def downgrade() -> None:
    op.drop_index(op.f("ix_logo_assets_key"), table_name="logo_assets")
    op.drop_index(op.f("ix_logo_assets_user_id"), table_name="logo_assets")
    op.drop_table("logo_assets")
