"""integrate demo stripe plans: single 99 subscription and 50 quota package

Revision ID: 014
Revises: 013
Create Date: 2026-03-07

将套餐收敛为与 payments_test demo 一致：仅保留 99 元/月订阅（basic）与 50 元/50 点配额包（pack_50），
其余套餐置为 is_active=false。Stripe Price ID 需在 Stripe Dashboard 中查看对应 Product 的 Price 后，
填入 config/stripe_price_ids.local.json 并执行 sync_stripe_price_ids.py 同步。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 订阅：仅保留 basic，改为 99 元/月「订阅套餐」；pro、ultimate 停用
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET name = '订阅套餐', quota_per_month = 30, price_cad = 99, storage_days = 30
            WHERE plan_type = 'basic'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans SET is_active = false
            WHERE plan_type IN ('pro', 'ultimate')
            """
        )
    )

    # 配额包：仅保留 pack_50，改为 50 点/50 元「配额包」；pack_10、pack_30 停用
    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET name = '配额包', quota_amount = 50, price_cad = 50, validity_days = NULL
            WHERE package_type = 'pack_50'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans SET is_active = false
            WHERE package_type IN ('pack_10', 'pack_30')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET name = '基础版', quota_per_month = 30, price_cad = 29, storage_days = 30
            WHERE plan_type = 'basic'
            """
        )
    )
    op.execute(
        sa.text("UPDATE subscription_plans SET is_active = true WHERE plan_type IN ('pro', 'ultimate')")
    )
    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET name = '加量包 50', quota_amount = 50, price_cad = 45, validity_days = NULL
            WHERE package_type = 'pack_50'
            """
        )
    )
    op.execute(
        sa.text("UPDATE quota_package_plans SET is_active = true WHERE package_type IN ('pack_10', 'pack_30')")
    )
