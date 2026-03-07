"""add billing and quota tables

Revision ID: 003
Revises: 002
Create Date: 2026-03-06

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("quota_per_month", sa.Integer(), nullable=False),
        sa.Column("price_cad", sa.Numeric(10, 2), nullable=False),
        sa.Column("storage_days", sa.Integer(), nullable=False),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscription_plans_plan_type"), "subscription_plans", ["plan_type"], unique=True)

    op.create_table(
        "quota_package_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("package_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("quota_amount", sa.Integer(), nullable=False),
        sa.Column("price_cad", sa.Numeric(10, 2), nullable=False),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quota_package_plans_package_type"), "quota_package_plans", ["package_type"], unique=True)

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("quota_per_month", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quota_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscriptions_user_id"), "subscriptions", ["user_id"], unique=False)

    op.create_table(
        "quota_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("package_type", sa.String(length=32), nullable=False),
        sa.Column("quota_total", sa.Integer(), nullable=False),
        sa.Column("quota_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quota_packages_user_id"), "quota_packages", ["user_id"], unique=False)

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO subscription_plans (id, plan_type, name, quota_per_month, price_cad, storage_days, stripe_price_id, is_active)
            VALUES
                (:basic_id, 'basic', '基础版', 30, 29.00, 30, NULL, true),
                (:pro_id, 'pro', 'Pro版', 120, 79.00, 60, NULL, true),
                (:ultimate_id, 'ultimate', 'Ultimate版', 300, 149.00, 90, NULL, true)
            ON CONFLICT (plan_type) DO NOTHING
            """
        ),
        {
            "basic_id": uuid.uuid4(),
            "pro_id": uuid.uuid4(),
            "ultimate_id": uuid.uuid4(),
        },
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO quota_package_plans (id, package_type, name, quota_amount, price_cad, validity_days, stripe_price_id, is_active)
            VALUES
                (:q10_id, 'pack_10', '加量包 10', 10, 12.00, 30, NULL, true),
                (:q30_id, 'pack_30', '加量包 30', 30, 30.00, 90, NULL, true),
                (:q50_id, 'pack_50', '加量包 50', 50, 45.00, NULL, NULL, true)
            ON CONFLICT (package_type) DO NOTHING
            """
        ),
        {
            "q10_id": uuid.uuid4(),
            "q30_id": uuid.uuid4(),
            "q50_id": uuid.uuid4(),
        },
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO quota_packages (id, user_id, package_type, quota_total, quota_used, expires_at, stripe_payment_intent_id)
            SELECT :package_id, users.id, 'signup_bonus', 5, 0, NULL, NULL
            FROM users
            WHERE users.username = 'root'
              AND NOT EXISTS (
                  SELECT 1 FROM quota_packages qp
                  WHERE qp.user_id = users.id AND qp.package_type = 'signup_bonus'
              )
            """
        ),
        {"package_id": uuid.uuid4()},
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_quota_packages_user_id"), table_name="quota_packages")
    op.drop_table("quota_packages")
    op.drop_index(op.f("ix_subscriptions_user_id"), table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index(op.f("ix_quota_package_plans_package_type"), table_name="quota_package_plans")
    op.drop_table("quota_package_plans")
    op.drop_index(op.f("ix_subscription_plans_plan_type"), table_name="subscription_plans")
    op.drop_table("subscription_plans")
