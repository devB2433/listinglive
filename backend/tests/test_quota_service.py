from datetime import datetime, timezone
from types import SimpleNamespace

from backend.services.quota_service import pick_current_subscription


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
