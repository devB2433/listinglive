import unittest
from unittest.mock import AsyncMock, Mock

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.services.quota_service import (
    LOCAL_SIGNUP_TRIAL_DAYS,
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
