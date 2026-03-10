import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.services.video_service import (
    TASK_SERVICE_TIER_FLEX,
    TASK_SERVICE_TIER_STANDARD,
    VIDEO_TASK_TYPE_LONG,
    VIDEO_TASK_TYPE_SHORT,
    build_next_flex_poll_at,
    is_flex_task_stale,
    merge_provider_task_ids,
    validate_service_tier_for_task_type,
)


class FlexVideoHelperTests(unittest.TestCase):
    def test_validate_service_tier_accepts_short_flex(self) -> None:
        self.assertEqual(
            validate_service_tier_for_task_type(task_type=VIDEO_TASK_TYPE_SHORT, service_tier=TASK_SERVICE_TIER_FLEX),
            TASK_SERVICE_TIER_FLEX,
        )

    def test_validate_service_tier_rejects_long_flex(self) -> None:
        with self.assertRaises(AppError) as ctx:
            validate_service_tier_for_task_type(task_type=VIDEO_TASK_TYPE_LONG, service_tier=TASK_SERVICE_TIER_FLEX)

        self.assertEqual(ctx.exception.code, "videos.long.flexUnavailable")

    def test_merge_provider_task_ids_keeps_provider_task_id(self) -> None:
        merged = merge_provider_task_ids(
            {"submission_id": "sub_123"},
            {"video_id": "vid_456"},
            provider_task_id="task_789",
        )

        self.assertEqual(
            merged,
            {
                "submission_id": "sub_123",
                "video_id": "vid_456",
                "provider_task_id": "task_789",
            },
        )

    def test_build_next_flex_poll_at_uses_configured_interval(self) -> None:
        now = datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc)
        next_poll_at = build_next_flex_poll_at(now=now)

        self.assertEqual(next_poll_at, now + timedelta(seconds=max(settings.FLEX_POLL_INTERVAL_SECONDS, 5)))

    def test_is_flex_task_stale_uses_provider_submission_time(self) -> None:
        now = datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc)
        task = SimpleNamespace(
            provider_submitted_at=now - timedelta(seconds=settings.FLEX_HARD_TIMEOUT_SECONDS + 1),
            processing_started_at=None,
            updated_at=now,
            created_at=now,
        )

        self.assertTrue(is_flex_task_stale(task, now=now))

    def test_validate_service_tier_defaults_to_standard(self) -> None:
        self.assertEqual(
            validate_service_tier_for_task_type(task_type=VIDEO_TASK_TYPE_SHORT, service_tier=None),
            TASK_SERVICE_TIER_STANDARD,
        )


if __name__ == "__main__":
    unittest.main()
