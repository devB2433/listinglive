import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from sqlalchemy.exc import MissingGreenlet

from backend.services.video_service import process_long_video_task, retry_long_video_task


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


class _FakeAsyncSessionContext:
    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeLockContext:
    async def __aenter__(self):
        return True

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _RollbackSensitiveSegment:
    def __init__(self, segment_id, *, status="queued", image_key="segment-image.jpg", duration_seconds=5):
        self._segment_id = segment_id
        self._invalid_after_rollback = False
        self.status = status
        self.image_key = image_key
        self.duration_seconds = duration_seconds
        self.provider_task_id = None
        self.segment_video_key = None
        self.processing_started_at = None
        self.finished_at = None
        self.scene_template_id = None

    @property
    def id(self):
        if self._invalid_after_rollback:
            raise MissingGreenlet("greenlet_spawn has not been called")
        return self._segment_id

    def invalidate_after_rollback(self):
        self._invalid_after_rollback = True


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

    async def test_process_long_task_uses_captured_segment_id_after_rollback(self) -> None:
        task = SimpleNamespace(
            id=uuid4(),
            task_type="long",
            status="processing",
            provider_task_ids={},
            scene_template_id=uuid4(),
            resolution="720p",
            aspect_ratio="9:16",
        )
        first_segment = _RollbackSensitiveSegment(uuid4())
        second_segment = _RollbackSensitiveSegment(uuid4())

        db = SimpleNamespace(
            get=AsyncMock(return_value=task),
            execute=AsyncMock(return_value=_FakeExecuteResult([first_segment, second_segment])),
            commit=AsyncMock(),
            rollback=AsyncMock(side_effect=lambda: first_segment.invalidate_after_rollback()),
        )

        fail_long_video_task_due_to_segment_error = AsyncMock(return_value=(task, []))

        with (
            patch("backend.services.video_service.AsyncSessionLocal", return_value=_FakeAsyncSessionContext(db)),
            patch("backend.services.video_service.hold_task_execution_lock", return_value=_FakeLockContext()),
            patch("backend.services.video_service.wait_for_task_execution_turn", AsyncMock(return_value=task)),
            patch(
                "backend.services.video_service.get_enabled_scene_template_by_category",
                AsyncMock(return_value=SimpleNamespace(prompt="segment prompt")),
            ),
            patch(
                "backend.services.video_service.generate_long_segment_output",
                AsyncMock(side_effect=RuntimeError("segment exploded")),
            ),
            patch(
                "backend.services.video_service.fail_long_video_task_due_to_segment_error",
                fail_long_video_task_due_to_segment_error,
            ),
            patch("backend.services.video_service.cleanup_storage_keys_best_effort", AsyncMock()),
            patch("backend.services.video_service.heartbeat_long_segment", AsyncMock()),
            patch("backend.services.video_service.heartbeat_active_video_task", AsyncMock()),
        ):
            await process_long_video_task(task.id)

        fail_long_video_task_due_to_segment_error.assert_awaited_once()
        self.assertEqual(fail_long_video_task_due_to_segment_error.await_args.kwargs["segment_id"], first_segment._segment_id)


if __name__ == "__main__":
    unittest.main()
