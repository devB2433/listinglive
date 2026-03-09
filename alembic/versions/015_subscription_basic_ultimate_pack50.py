"""subscription plans: Basic 20, Ultimate 99, pack_50 only

Revision ID: 015
Revises: 014
Create Date: 2026-03-08

将套餐收敛为：仅 Basic 20 元/月、Ultimate 99 元/月两种订阅，及 50 元/50 点扩展包。
pro 保持 is_active=false；pack_10、pack_30 保持 is_active=false。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Basic: 20 元/月，配额 20，存储 30 天
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET name = 'Basic', quota_per_month = 20, price_cad = 20, storage_days = 30
            WHERE plan_type = 'basic'
            """
        )
    )
    op.execute(sa.text("UPDATE subscription_plans SET is_active = true WHERE plan_type = 'basic'"))

    # Ultimate: 99 元/月，激活
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET name = 'Ultimate', quota_per_month = 99, price_cad = 99, storage_days = 90
            WHERE plan_type = 'ultimate'
            """
        )
    )
    op.execute(sa.text("UPDATE subscription_plans SET is_active = true WHERE plan_type = 'ultimate'"))

    # Pro: 保持停用
    op.execute(sa.text("UPDATE subscription_plans SET is_active = false WHERE plan_type = 'pro'"))

    # 扩展包：仅 pack_50 激活，50 元/50 点
    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET name = '扩展包', quota_amount = 50, price_cad = 50, validity_days = NULL
            WHERE package_type = 'pack_50'
            """
        )
    )
    op.execute(sa.text("UPDATE quota_package_plans SET is_active = true WHERE package_type = 'pack_50'"))
    op.execute(
        sa.text("UPDATE quota_package_plans SET is_active = false WHERE package_type IN ('pack_10', 'pack_30')")
    )


def downgrade() -> None:
    # 恢复 014 状态：仅 basic 99 元，ultimate/pro 停用
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET name = '订阅套餐', quota_per_month = 30, price_cad = 99, storage_days = 30
            WHERE plan_type = 'basic'
            """
        )
    )
    op.execute(sa.text("UPDATE subscription_plans SET is_active = false WHERE plan_type IN ('pro', 'ultimate')"))

    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET name = '配额包', quota_amount = 50, price_cad = 50, validity_days = NULL
            WHERE package_type = 'pack_50'
            """
        )
    )
    op.execute(sa.text("UPDATE quota_package_plans SET is_active = true WHERE package_type IN ('pack_10', 'pack_30')"))
