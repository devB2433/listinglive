"""update billing catalog pricing

Revision ID: 022_billing_catalog
Revises: 021_admin_mfa_fields
Create Date: 2026-03-09
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "022_billing_catalog"
down_revision: Union[str, None] = "021_admin_mfa_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO quota_package_plans (
                id,
                package_type,
                name,
                quota_amount,
                price_cad,
                validity_days,
                stripe_price_id,
                is_active
            )
            VALUES (
                :pack_150_id,
                'pack_150',
                'Credits 150',
                150,
                50.00,
                NULL,
                NULL,
                true
            )
            ON CONFLICT (package_type) DO NOTHING
            """
        ),
        {"pack_150_id": uuid.uuid4()},
    )

    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET
                name = CASE
                    WHEN plan_type = 'basic' THEN 'Basic'
                    WHEN plan_type = 'pro' THEN 'Pro'
                    WHEN plan_type = 'ultimate' THEN 'Ultimate'
                    ELSE name
                END,
                quota_per_month = CASE
                    WHEN plan_type = 'basic' THEN 20
                    WHEN plan_type = 'pro' THEN 50
                    WHEN plan_type = 'ultimate' THEN 150
                    ELSE quota_per_month
                END,
                price_cad = CASE
                    WHEN plan_type = 'basic' THEN 9.90
                    WHEN plan_type = 'pro' THEN 19.90
                    WHEN plan_type = 'ultimate' THEN 49.90
                    ELSE price_cad
                END,
                storage_days = CASE
                    WHEN plan_type = 'basic' THEN 30
                    WHEN plan_type = 'pro' THEN 60
                    WHEN plan_type = 'ultimate' THEN 90
                    ELSE storage_days
                END,
                is_active = CASE
                    WHEN plan_type IN ('basic', 'pro', 'ultimate') THEN true
                    ELSE is_active
                END
            WHERE plan_type IN ('basic', 'pro', 'ultimate')
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET
                name = CASE
                    WHEN package_type = 'pack_10' THEN 'Credits 10'
                    WHEN package_type = 'pack_50' THEN 'Credits 50'
                    WHEN package_type = 'pack_150' THEN 'Credits 150'
                    ELSE name
                END,
                quota_amount = CASE
                    WHEN package_type = 'pack_10' THEN 10
                    WHEN package_type = 'pack_50' THEN 50
                    WHEN package_type = 'pack_150' THEN 150
                    ELSE quota_amount
                END,
                price_cad = CASE
                    WHEN package_type = 'pack_10' THEN 5.00
                    WHEN package_type = 'pack_50' THEN 20.00
                    WHEN package_type = 'pack_150' THEN 50.00
                    ELSE price_cad
                END,
                validity_days = NULL,
                is_active = CASE
                    WHEN package_type IN ('pack_10', 'pack_50', 'pack_150') THEN true
                    WHEN package_type = 'pack_30' THEN false
                    ELSE is_active
                END
            WHERE package_type IN ('pack_10', 'pack_30', 'pack_50', 'pack_150')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET
                name = CASE
                    WHEN plan_type = 'basic' THEN 'Basic'
                    WHEN plan_type = 'pro' THEN 'Pro版'
                    WHEN plan_type = 'ultimate' THEN 'Ultimate'
                    ELSE name
                END,
                quota_per_month = CASE
                    WHEN plan_type = 'basic' THEN 20
                    WHEN plan_type = 'pro' THEN 120
                    WHEN plan_type = 'ultimate' THEN 99
                    ELSE quota_per_month
                END,
                price_cad = CASE
                    WHEN plan_type = 'basic' THEN 20.00
                    WHEN plan_type = 'pro' THEN 79.00
                    WHEN plan_type = 'ultimate' THEN 99.00
                    ELSE price_cad
                END,
                storage_days = CASE
                    WHEN plan_type = 'basic' THEN 30
                    WHEN plan_type = 'pro' THEN 60
                    WHEN plan_type = 'ultimate' THEN 90
                    ELSE storage_days
                END,
                is_active = CASE
                    WHEN plan_type IN ('basic', 'ultimate') THEN true
                    WHEN plan_type = 'pro' THEN false
                    ELSE is_active
                END
            WHERE plan_type IN ('basic', 'pro', 'ultimate')
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE quota_package_plans
            SET
                name = CASE
                    WHEN package_type = 'pack_10' THEN '加量包 10'
                    WHEN package_type = 'pack_30' THEN '加量包 30'
                    WHEN package_type = 'pack_50' THEN '扩展包'
                    ELSE name
                END,
                quota_amount = CASE
                    WHEN package_type = 'pack_10' THEN 10
                    WHEN package_type = 'pack_30' THEN 30
                    WHEN package_type = 'pack_50' THEN 50
                    ELSE quota_amount
                END,
                price_cad = CASE
                    WHEN package_type = 'pack_10' THEN 12.00
                    WHEN package_type = 'pack_30' THEN 30.00
                    WHEN package_type = 'pack_50' THEN 50.00
                    ELSE price_cad
                END,
                validity_days = CASE
                    WHEN package_type = 'pack_10' THEN 30
                    WHEN package_type = 'pack_30' THEN 90
                    WHEN package_type = 'pack_50' THEN NULL
                    ELSE validity_days
                END,
                is_active = CASE
                    WHEN package_type = 'pack_50' THEN true
                    WHEN package_type IN ('pack_10', 'pack_30') THEN false
                    ELSE is_active
                END
            WHERE package_type IN ('pack_10', 'pack_30', 'pack_50')
            """
        )
    )

    op.execute(sa.text("DELETE FROM quota_package_plans WHERE package_type = 'pack_150'"))
