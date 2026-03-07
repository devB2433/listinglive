"""add stripe billing foundation

Revision ID: 010
Revises: 009
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_users_stripe_customer_id"), "users", ["stripe_customer_id"], unique=True)

    op.add_column("subscriptions", sa.Column("subscription_plan_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("subscriptions", sa.Column("stripe_price_id", sa.String(length=255), nullable=True))
    op.add_column(
        "subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("subscriptions", sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column("latest_invoice_id", sa.String(length=255), nullable=True))
    op.add_column("subscriptions", sa.Column("last_stripe_event_id", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_subscriptions_subscription_plan_id",
        "subscriptions",
        "subscription_plans",
        ["subscription_plan_id"],
        ["id"],
    )

    op.add_column("quota_packages", sa.Column("quota_package_plan_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("quota_packages", sa.Column("stripe_checkout_session_id", sa.String(length=255), nullable=True))
    op.add_column("quota_packages", sa.Column("stripe_price_id", sa.String(length=255), nullable=True))
    op.add_column("quota_packages", sa.Column("payment_status", sa.String(length=32), nullable=True))
    op.add_column("quota_packages", sa.Column("last_stripe_event_id", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_quota_packages_quota_package_plan_id",
        "quota_packages",
        "quota_package_plans",
        ["quota_package_plan_id"],
        ["id"],
    )

    op.create_table(
        "stripe_webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("object_id", sa.String(length=255), nullable=True),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stripe_webhook_events_event_id"), "stripe_webhook_events", ["event_id"], unique=True)

    op.execute(sa.text("UPDATE quota_package_plans SET validity_days = NULL"))


def downgrade() -> None:
    op.drop_index(op.f("ix_stripe_webhook_events_event_id"), table_name="stripe_webhook_events")
    op.drop_table("stripe_webhook_events")

    op.drop_constraint("fk_quota_packages_quota_package_plan_id", "quota_packages", type_="foreignkey")
    op.drop_column("quota_packages", "last_stripe_event_id")
    op.drop_column("quota_packages", "payment_status")
    op.drop_column("quota_packages", "stripe_price_id")
    op.drop_column("quota_packages", "stripe_checkout_session_id")
    op.drop_column("quota_packages", "quota_package_plan_id")

    op.drop_constraint("fk_subscriptions_subscription_plan_id", "subscriptions", type_="foreignkey")
    op.drop_column("subscriptions", "last_stripe_event_id")
    op.drop_column("subscriptions", "latest_invoice_id")
    op.drop_column("subscriptions", "canceled_at")
    op.drop_column("subscriptions", "cancel_at_period_end")
    op.drop_column("subscriptions", "stripe_price_id")
    op.drop_column("subscriptions", "subscription_plan_id")

    op.drop_index(op.f("ix_users_stripe_customer_id"), table_name="users")
    op.drop_column("users", "stripe_customer_id")
