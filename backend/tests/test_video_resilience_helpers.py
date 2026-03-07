from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.services.video_service import create_temporary_output_path, is_task_stale


def test_create_temporary_output_path_keeps_parent_and_extension() -> None:
    output_path = Path("data/storage/videos/2026/03/07/example.mp4")

    temp_path = create_temporary_output_path(output_path)

    assert temp_path.parent == output_path.parent
    assert temp_path.suffix == ".mp4"
    assert temp_path.name.startswith("example.tmp")


def test_is_task_stale_detects_old_updated_at() -> None:
    now = datetime(2026, 3, 7, tzinfo=timezone.utc)
    updated_at = now - timedelta(seconds=1810)

    assert is_task_stale(updated_at, now=now, stale_seconds=1800) is True


def test_is_task_stale_keeps_recent_tasks_active() -> None:
    now = datetime(2026, 3, 7, tzinfo=timezone.utc)
    updated_at = now - timedelta(seconds=120)

    assert is_task_stale(updated_at, now=now, stale_seconds=1800) is False
