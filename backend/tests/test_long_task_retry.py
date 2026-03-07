import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from backend.services.video_service import retry_long_video_task


class _FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _FakeExecuteResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return _FakeScalarResult(self._items)


class LongTaskRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_retry_only_resets_failed_segments_and_keeps_parent_processing(self) -> None:
        now = datetime.now(timezone.utc)
        task = SimpleNamespace(
            id=uuid4(),
            task_type="long",
            status="processing",
            quota_refunded_at=None,
            quota_consumed=1,
            planned_quota_consumed=1,
            charged_quota_consumed=0,
            charge_status="pending",
            charged_at=None,
            video_key=None,
            error_message="segment failed",
            processing_started_at=now,
            finished_at=now,
            provider_task_ids={},
        )
        succeeded_segment = SimpleNamespace(
            id=uuid4(),
            status="succeeded",
            segment_video_key="segment-ok.mp4",
            provider_task_id="provider-ok",
            error_message=None,
            queued_at=now,
            processing_started_at=now,
            finished_at=now,
        )
        failed_segment = SimpleNamespace(
            id=uuid4(),
            status="failed",
            segment_video_key="segment-failed.mp4",
            provider_task_id="provider-failed",
            error_message="boom",
            queued_at=now,
            processing_started_at=now,
            finished_at=now,
        )
        queued_segment = SimpleNamespace(
            id=uuid4(),
            status="queued",
            segment_video_key=None,
            provider_task_id=None,
            error_message="stale",
            queued_at=now,
            processing_started_at=None,
            finished_at=None,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_FakeExecuteResult([succeeded_segment, failed_segment, queued_segment])),
            flush=AsyncMock(),
        )

        with patch("backend.services.video_service.get_video_task_for_user", AsyncMock(return_value=task)):
            updated_task, cleanup_keys = await retry_long_video_task(db, user_id=uuid4(), task_id=task.id)

        self.assertIs(updated_task, task)
        self.assertEqual(task.status, "processing")
        self.assertIsNone(task.error_message)
        self.assertEqual(task.provider_task_ids["segment_count"], 3)
        self.assertEqual(task.provider_task_ids["completed_segments"], 1)
        self.assertEqual(
            task.provider_task_ids["segments"][str(succeeded_segment.id)],
            {"provider_task_id": "provider-ok"},
        )
        self.assertEqual(failed_segment.status, "queued")
        self.assertIsNone(failed_segment.segment_video_key)
        self.assertIsNone(failed_segment.provider_task_id)
        self.assertIsNone(failed_segment.error_message)
        self.assertIsNone(failed_segment.processing_started_at)
        self.assertIsNone(failed_segment.finished_at)
        self.assertEqual(queued_segment.status, "queued")
        self.assertIsNone(queued_segment.segment_video_key)
        self.assertIsNone(queued_segment.provider_task_id)
        self.assertIsNone(queued_segment.error_message)
        self.assertEqual(cleanup_keys, ["segment-failed.mp4"])
        self.assertEqual(task.charge_status, "pending")
        self.assertEqual(task.charged_quota_consumed, 0)
        self.assertIsNone(task.charged_at)
        db.flush.assert_awaited_once()

    async def test_retry_failed_parent_can_resume_merge_without_reconsuming_quota(self) -> None:
        now = datetime.now(timezone.utc)
        task = SimpleNamespace(
            id=uuid4(),
            task_type="long",
            status="failed",
            quota_refunded_at=now,
            quota_consumed=2,
            planned_quota_consumed=2,
            charged_quota_consumed=0,
            charge_status="skipped",
            charged_at=now,
            video_key="final-output.mp4",
            error_message="merge failed",
            processing_started_at=now,
            finished_at=now,
            provider_task_ids={},
        )
        succeeded_segments = [
            SimpleNamespace(
                id=uuid4(),
                status="succeeded",
                segment_video_key=f"segment-{index}.mp4",
                provider_task_id=f"provider-{index}",
                error_message=None,
                queued_at=now,
                processing_started_at=now,
                finished_at=now,
            )
            for index in range(2)
        ]
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_FakeExecuteResult(succeeded_segments)),
            flush=AsyncMock(),
        )

        with patch("backend.services.video_service.get_video_task_for_user", AsyncMock(return_value=task)):
            updated_task, cleanup_keys = await retry_long_video_task(db, user_id=uuid4(), task_id=task.id)

        self.assertIs(updated_task, task)
        self.assertEqual(task.status, "processing")
        self.assertIsNone(task.quota_refunded_at)
        self.assertIsNone(task.video_key)
        self.assertEqual(task.provider_task_ids["completed_segments"], 2)
        self.assertEqual(cleanup_keys, ["final-output.mp4"])
        self.assertEqual(task.charge_status, "pending")
        self.assertEqual(task.charged_quota_consumed, 0)
        self.assertIsNone(task.charged_at)
        db.flush.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
