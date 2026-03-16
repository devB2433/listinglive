import unittest
from unittest.mock import AsyncMock, Mock

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.services.quota_service import (
    LOCAL_SIGNUP_TRIAL_DAYS,
    QuotaInsufficientError,
    consume_quota,
    ensure_signup_pro_trial_subscription,
    is_local_trial_subscription,
    pick_current_subscription,
)


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def test_pick_current_subscription_prefers_newer_billing_period() -> None:
    stale_but_later_inserted = SimpleNamespace(
        current_period_start=datetime(2026, 2, 1, tzinfo=timezone.utc),
        current_period_end=datetime(2026, 3, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 3, 8, 12, 0, tzinfo=timezone.utc),
    )
    current_subscription = SimpleNamespace(
        current_period_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
        current_period_end=datetime(2026, 4, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 3, 8, 11, 0, tzinfo=timezone.utc),
    )

    picked = pick_current_subscription(
        [stale_but_later_inserted, current_subscription],
        now=datetime(2026, 3, 8, 13, 0, tzinfo=timezone.utc),
    )

    assert picked is current_subscription


def test_pick_current_subscription_returns_none_when_all_expired() -> None:
    expired_subscription = SimpleNamespace(
        current_period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        current_period_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )

    picked = pick_current_subscription(
        [expired_subscription],
        now=datetime(2026, 3, 8, tzinfo=timezone.utc),
    )

    assert picked is None


def test_pick_current_subscription_prefers_billing_managed_subscription_when_dates_match() -> None:
    period_start = datetime(2026, 3, 1, tzinfo=timezone.utc)
    period_end = datetime(2026, 4, 1, tzinfo=timezone.utc)
    local_trial = SimpleNamespace(
        current_period_start=period_start,
        current_period_end=period_end,
        created_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
        stripe_subscription_id=None,
        status="trialing",
    )
    stripe_subscription = SimpleNamespace(
        current_period_start=period_start,
        current_period_end=period_end,
        created_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
        stripe_subscription_id="sub_123",
        status="active",
    )

    picked = pick_current_subscription(
        [local_trial, stripe_subscription],
        now=datetime(2026, 3, 8, 13, 0, tzinfo=timezone.utc),
    )

    assert picked is stripe_subscription


def test_is_local_trial_subscription_only_matches_non_stripe_trialing_rows() -> None:
    assert is_local_trial_subscription(
        SimpleNamespace(
            status="trialing",
            stripe_subscription_id=None,
        )
    )
    assert not is_local_trial_subscription(
        SimpleNamespace(
            status="active",
            stripe_subscription_id=None,
        )
    )
    assert not is_local_trial_subscription(
        SimpleNamespace(
            status="trialing",
            stripe_subscription_id="sub_123",
        )
    )


class SignupTrialQuotaTests(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_signup_pro_trial_subscription_keeps_monthly_quota_zero(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _FakeResult(None),
                _FakeResult(SimpleNamespace(id="plan-pro", storage_days=30)),
            ]
        )
        db.flush = AsyncMock()
        db.add = Mock()

        subscription = await ensure_signup_pro_trial_subscription(db, "user-1")

        db.add.assert_called_once_with(subscription)
        self.assertEqual(subscription.plan_type, "pro")
        self.assertEqual(subscription.status, "trialing")
        self.assertEqual(subscription.quota_per_month, 0)
        self.assertEqual(subscription.quota_used, 0)
        self.assertEqual(subscription.storage_days, 30)
        self.assertIsNotNone(subscription.current_period_start)
        self.assertIsNotNone(subscription.current_period_end)
        self.assertEqual(
            subscription.current_period_end - subscription.current_period_start,
            timedelta(days=LOCAL_SIGNUP_TRIAL_DAYS),
        )


class QuotaConsumptionTests(unittest.IsolatedAsyncioTestCase):
    async def test_consume_quota_uses_subscription_before_paid_package_and_bonus(self) -> None:
        subscription = SimpleNamespace(quota_per_month=2, quota_used=0)
        signup_bonus_package = SimpleNamespace(
            package_type="signup_bonus",
            quota_total=5,
            quota_used=0,
            expires_at=None,
            created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        paid_package = SimpleNamespace(
            package_type="pack_10",
            quota_total=10,
            quota_used=0,
            expires_at=None,
            created_at=datetime(2026, 3, 2, tzinfo=timezone.utc),
        )
        db = AsyncMock()

        with unittest.mock.patch(
            "backend.services.quota_service.get_quota_snapshot",
            AsyncMock(
                return_value={
                    "subscription": subscription,
                    "total_available": 17,
                    "pending_reserved": 0,
                    "packages": [signup_bonus_package, paid_package],
                }
            ),
        ):
            breakdown = await consume_quota(db, "user-1", 4)

        self.assertEqual(subscription.quota_used, 2)
        self.assertEqual(paid_package.quota_used, 2)
        self.assertEqual(signup_bonus_package.quota_used, 0)
        self.assertEqual(breakdown.subscription_used, 2)
        self.assertEqual(breakdown.paid_package_used, 2)
        self.assertEqual(breakdown.signup_bonus_used, 0)

    async def test_consume_quota_raises_structured_error_when_total_available_is_insufficient(self) -> None:
        db = AsyncMock()
        with unittest.mock.patch(
            "backend.services.quota_service.get_quota_snapshot",
            AsyncMock(
                return_value={
                    "subscription": None,
                    "total_available": 2,
                    "pending_reserved": 0,
                    "packages": [],
                }
            ),
        ):
            with self.assertRaises(QuotaInsufficientError) as ctx:
                await consume_quota(db, "user-1", 4)

        self.assertEqual(ctx.exception.code, "billing.quota.insufficient")
        self.assertEqual(ctx.exception.required_quota, 4)
        self.assertEqual(ctx.exception.available_quota, 2)
