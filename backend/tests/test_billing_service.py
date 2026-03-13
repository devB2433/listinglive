import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.services.billing_service import compute_subscription_quota_used, create_subscription_checkout


def test_upgrade_within_same_cycle_keeps_used_quota() -> None:
    period_start = datetime(2026, 3, 1, tzinfo=timezone.utc)
    period_end = datetime(2026, 4, 1, tzinfo=timezone.utc)
    subscription = SimpleNamespace(
        quota_used=10,
        current_period_start=period_start,
        current_period_end=period_end,
    )

    quota_used = compute_subscription_quota_used(
        subscription,
        plan_quota_per_month=120,
        period_start=period_start,
        period_end=period_end,
    )

    assert quota_used == 10


def test_new_cycle_resets_used_quota() -> None:
    old_period_start = datetime(2026, 3, 1, tzinfo=timezone.utc)
    old_period_end = datetime(2026, 4, 1, tzinfo=timezone.utc)
    new_period_start = old_period_end
    new_period_end = new_period_start + timedelta(days=30)
    subscription = SimpleNamespace(
        quota_used=25,
        current_period_start=old_period_start,
        current_period_end=old_period_end,
    )

    quota_used = compute_subscription_quota_used(
        subscription,
        plan_quota_per_month=120,
        period_start=new_period_start,
        period_end=new_period_end,
    )

    assert quota_used == 0


def test_same_cycle_downgrade_caps_used_quota() -> None:
    period_start = datetime(2026, 3, 1, tzinfo=timezone.utc)
    period_end = datetime(2026, 4, 1, tzinfo=timezone.utc)
    subscription = SimpleNamespace(
        quota_used=40,
        current_period_start=period_start,
        current_period_end=period_end,
    )

    quota_used = compute_subscription_quota_used(
        subscription,
        plan_quota_per_month=30,
        period_start=period_start,
        period_end=period_end,
    )

    assert quota_used == 30


class BillingCheckoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_subscription_checkout_allows_same_plan_when_current_access_is_local_trial(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-1")
        plan = SimpleNamespace(
            id="plan-1",
            plan_type="pro",
            stripe_price_id="price_pro",
        )

        with patch("backend.services.billing_service._get_plan_by_id", AsyncMock(return_value=plan)):
            with patch(
                "backend.services.billing_service.build_user_access_context",
                AsyncMock(
                    return_value=SimpleNamespace(
                        subscription_plan_type="pro",
                        subscription_is_billing_managed=False,
                    )
                ),
            ):
                with patch("backend.services.billing_service.get_or_create_customer_id", AsyncMock(return_value="cus_123")):
                    with patch(
                        "backend.services.billing_service.create_subscription_checkout_session",
                        return_value="https://stripe.test/checkout",
                    ) as create_session:
                        checkout_url = await create_subscription_checkout(db, user, plan.id)

        self.assertEqual(checkout_url, "https://stripe.test/checkout")
        create_session.assert_called_once_with(
            customer_id="cus_123",
            price_id="price_pro",
            user_id="user-1",
            plan_id="plan-1",
            plan_type="pro",
        )
