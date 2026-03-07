from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.services.billing_service import compute_subscription_quota_used


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
