"""add avatar assets and profile cards

Revision ID: 023_avatar_cards
Revises: 022_billing_catalog
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "023_avatar_cards"
down_revision: Union[str, None] = "022_billing_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "avatar_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_avatar_assets_key"), "avatar_assets", ["key"], unique=True)
    op.create_index(op.f("ix_avatar_assets_user_id"), "avatar_assets", ["user_id"], unique=False)

    op.create_table(
        "profile_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False, server_default=sa.text("'Default card'")),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("contact_address", sa.String(length=255), nullable=False),
        sa.Column("brokerage_name", sa.String(length=120), nullable=False),
        sa.Column("avatar_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("logo_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("show_avatar_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_name_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_phone_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_address_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_brokerage_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_logo_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["avatar_asset_id"], ["avatar_assets.id"]),
        sa.ForeignKeyConstraint(["logo_asset_id"], ["logo_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_profile_cards_user_id"), "profile_cards", ["user_id"], unique=False)
    op.create_index(op.f("ix_profile_cards_avatar_asset_id"), "profile_cards", ["avatar_asset_id"], unique=False)
    op.create_index(op.f("ix_profile_cards_logo_asset_id"), "profile_cards", ["logo_asset_id"], unique=False)

    op.add_column("video_tasks", sa.Column("avatar_key", sa.String(length=255), nullable=True))
    op.add_column("video_tasks", sa.Column("avatar_position", sa.String(length=32), nullable=True))
    op.add_column("video_tasks", sa.Column("profile_card_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("video_tasks", sa.Column("profile_card_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_index(op.f("ix_video_tasks_profile_card_id"), "video_tasks", ["profile_card_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_video_tasks_profile_card_id_profile_cards"),
        "video_tasks",
        "profile_cards",
        ["profile_card_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_video_tasks_profile_card_id_profile_cards"), "video_tasks", type_="foreignkey")
    op.drop_index(op.f("ix_video_tasks_profile_card_id"), table_name="video_tasks")
    op.drop_column("video_tasks", "profile_card_data")
    op.drop_column("video_tasks", "profile_card_id")
    op.drop_column("video_tasks", "avatar_position")
    op.drop_column("video_tasks", "avatar_key")

    op.drop_index(op.f("ix_profile_cards_logo_asset_id"), table_name="profile_cards")
    op.drop_index(op.f("ix_profile_cards_avatar_asset_id"), table_name="profile_cards")
    op.drop_index(op.f("ix_profile_cards_user_id"), table_name="profile_cards")
    op.drop_table("profile_cards")

    op.drop_index(op.f("ix_avatar_assets_user_id"), table_name="avatar_assets")
    op.drop_index(op.f("ix_avatar_assets_key"), table_name="avatar_assets")
    op.drop_table("avatar_assets")
