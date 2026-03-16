import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.core.api_errors import AppError
from backend.services.billing_service import (
    _READ_SYNC_THROTTLE,
    _extract_subscription_period,
    _grant_upgrade_carryover_package,
    _grant_quota_package_from_checkout_session,
    compute_subscription_quota_used,
    create_subscription_checkout,
    sync_subscription_state_on_read,
)


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


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


def test_extract_subscription_period_falls_back_to_item_period() -> None:
    payload = {
        "current_period_start": None,
        "current_period_end": None,
        "items": {
            "data": [
                {
                    "current_period_start": 1711929600,
                    "current_period_end": 1714521600,
                }
            ]
        },
    }

    period_start, period_end = _extract_subscription_period(payload)

    assert period_start is not None
    assert period_end is not None
    assert period_start.year == 2024
    assert period_end.year == 2024


class BillingCheckoutTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _READ_SYNC_THROTTLE.clear()

    async def test_create_subscription_checkout_allows_same_plan_when_current_access_is_local_trial(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-1", stripe_customer_id=None)
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
            effective_strategy="immediate",
            trial_end_at=None,
        )

    async def test_create_subscription_checkout_runs_live_precheck_for_existing_customer(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-1", stripe_customer_id="cus_live_1")
        plan = SimpleNamespace(id="plan-1", plan_type="pro", stripe_price_id="price_pro")

        with (
            patch("backend.services.billing_service._get_plan_by_id", AsyncMock(return_value=plan)),
            patch("backend.services.billing_service._sync_remote_active_subscriptions", AsyncMock()) as sync_remote,
            patch(
                "backend.services.billing_service.build_user_access_context",
                AsyncMock(
                    return_value=SimpleNamespace(
                        subscription_plan_type=None,
                        subscription_is_billing_managed=False,
                        subscription_is_local_trial=False,
                        trial_expires_at=None,
                    )
                ),
            ),
            patch("backend.services.billing_service.get_or_create_customer_id", AsyncMock(return_value="cus_live_1")),
            patch(
                "backend.services.billing_service.create_subscription_checkout_session",
                return_value="https://stripe.test/checkout",
            ),
        ):
            await create_subscription_checkout(db, user, plan.id)

        sync_remote.assert_awaited_once()
        called_event_id = sync_remote.await_args.kwargs["event_id"]
        self.assertTrue(called_event_id.startswith("precheck:user-1:"))

    async def test_create_subscription_checkout_requires_strategy_for_local_trial(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-1", stripe_customer_id=None)
        plan = SimpleNamespace(id="plan-1", plan_type="pro", stripe_price_id="price_pro")

        with (
            patch("backend.services.billing_service._get_plan_by_id", AsyncMock(return_value=plan)),
            patch(
                "backend.services.billing_service.build_user_access_context",
                AsyncMock(
                    return_value=SimpleNamespace(
                        subscription_plan_type="pro",
                        subscription_is_billing_managed=False,
                        subscription_is_local_trial=True,
                        trial_expires_at=datetime.now(timezone.utc) + timedelta(days=2),
                    )
                ),
            ),
        ):
            with self.assertRaises(AppError):
                await create_subscription_checkout(db, user, plan.id)

    async def test_grant_quota_package_creates_non_expiring_package(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_FakeResult(None), _FakeResult(None)])
        db.add = unittest.mock.Mock()
        db.flush = AsyncMock()
        user = SimpleNamespace(id="user-1", stripe_customer_id=None)
        package_plan = SimpleNamespace(
            id="pack-plan-1",
            package_type="pack_10",
            quota_amount=10,
            stripe_price_id="price_pack_10",
        )
        payload = {
            "id": "cs_test_123",
            "payment_intent": "pi_test_123",
            "metadata": {
                "package_plan_id": "11111111-1111-1111-1111-111111111111",
            },
        }

        with (
            patch("backend.services.billing_service._resolve_user_for_stripe_object", AsyncMock(return_value=user)),
            patch("backend.services.billing_service._get_quota_package_plan_by_id", AsyncMock(return_value=package_plan)),
        ):
            package = await _grant_quota_package_from_checkout_session(db, payload, "evt_123")

        db.add.assert_called_once_with(package)
        self.assertEqual(package.user_id, "user-1")
        self.assertEqual(package.quota_total, 10)
        self.assertEqual(package.quota_used, 0)
        self.assertIsNone(package.expires_at)

    async def test_upgrade_carryover_package_is_idempotent(self) -> None:
        db = AsyncMock()
        existing = SimpleNamespace(id="existing")
        db.execute = AsyncMock(side_effect=[_FakeResult(None), _FakeResult(existing)])
        db.add = unittest.mock.Mock()
        db.flush = AsyncMock()

        created = await _grant_upgrade_carryover_package(
            db,
            user_id="user-1",
            stripe_subscription_id="sub_1",
            from_plan_type="basic",
            to_plan_type="pro",
            old_quota_per_month=20,
            old_quota_used=7,
            period_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
            event_id="evt_1",
        )
        second = await _grant_upgrade_carryover_package(
            db,
            user_id="user-1",
            stripe_subscription_id="sub_1",
            from_plan_type="basic",
            to_plan_type="pro",
            old_quota_per_month=20,
            old_quota_used=7,
            period_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
            event_id="evt_2",
        )

        self.assertIsNotNone(created)
        self.assertEqual(created.quota_total, 13)
        self.assertIs(second, existing)

    async def test_sync_subscription_state_on_read_is_throttled(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-read-1", stripe_customer_id="cus_live_1")

        with patch("backend.services.billing_service._sync_remote_active_subscriptions", AsyncMock()) as sync_remote:
            await sync_subscription_state_on_read(db, user)
            await sync_subscription_state_on_read(db, user)

        sync_remote.assert_awaited_once()

    async def test_sync_subscription_state_on_read_falls_back_to_local_converge_when_remote_fails(self) -> None:
        db = AsyncMock()
        user = SimpleNamespace(id="user-read-2", stripe_customer_id="cus_live_2")

        with (
            patch(
                "backend.services.billing_service._sync_remote_active_subscriptions",
                AsyncMock(side_effect=RuntimeError("stripe unavailable")),
            ),
            patch("backend.services.billing_service._converge_user_active_subscriptions", AsyncMock()) as converge,
        ):
            await sync_subscription_state_on_read(db, user, force=True)

        converge.assert_awaited_once()
