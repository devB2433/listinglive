import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from backend.services.quota_service import check_quota_available, get_task_charge_reconciliation
from backend.services.video_service import settle_task_quota_charge


class _FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _FakeExecuteResult:
    def __init__(self, items=None, one_result=None):
        self._items = items or []
        self._one_result = one_result

    def scalars(self):
        return _FakeScalarResult(self._items)

    def one(self):
        return self._one_result


class SuccessBillingTests(unittest.IsolatedAsyncioTestCase):
    async def test_check_quota_available_subtracts_pending_reservations(self) -> None:
        db = SimpleNamespace()
        with (
            patch("backend.services.quota_service.get_quota_snapshot", AsyncMock(return_value={"total_available": 10})),
            patch("backend.services.quota_service.get_pending_task_charge_amount", AsyncMock(return_value=4)),
        ):
            available = await check_quota_available(db, uuid4(), 6)
            self.assertEqual(available, 6)
            with self.assertRaisesRegex(ValueError, "可用配额不足"):
                await check_quota_available(db, uuid4(), 7)

    async def test_settle_task_quota_charge_is_idempotent(self) -> None:
        now = datetime.now(timezone.utc)
        task = SimpleNamespace(
            user_id=uuid4(),
            planned_quota_consumed=4,
            charged_quota_consumed=0,
            charge_status="pending",
            charged_at=None,
            quota_refunded_at=now,
        )
        db = SimpleNamespace()

        with patch("backend.services.video_service.consume_quota", AsyncMock()) as consume_quota:
            await settle_task_quota_charge(db, task)
            await settle_task_quota_charge(db, task)

        consume_quota.assert_awaited_once_with(db, task.user_id, 4)
        self.assertEqual(task.charged_quota_consumed, 4)
        self.assertEqual(task.charge_status, "charged")
        self.assertIsNotNone(task.charged_at)
        self.assertIsNone(task.quota_refunded_at)

    async def test_get_task_charge_reconciliation_returns_summary_and_items(self) -> None:
        tasks = [
            SimpleNamespace(
                id=uuid4(),
                task_type="short",
                status="succeeded",
                planned_quota_consumed=1,
                charged_quota_consumed=1,
                charge_status="charged",
                charged_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
            )
        ]
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    _FakeExecuteResult(items=tasks),
                    _FakeExecuteResult(one_result=(1, 1, 1, 1, 0, 0, 0)),
                ]
            )
        )

        result = await get_task_charge_reconciliation(db, uuid4(), limit=20)

        self.assertEqual(result["total_tasks"], 1)
        self.assertEqual(result["planned_total"], 1)
        self.assertEqual(result["charged_total"], 1)
        self.assertEqual(result["successful_short_tasks"], 1)
        self.assertEqual(result["successful_long_tasks"], 0)
        self.assertEqual(result["successful_long_segments"], 0)
        self.assertEqual(result["pending_reserved_total"], 0)
        self.assertEqual(result["items"], tasks)


if __name__ == "__main__":
    unittest.main()
