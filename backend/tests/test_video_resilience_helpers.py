from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from backend.core.api_errors import AppError
from backend.services.entitlement_service import PermissionDeniedError
from backend.services.video_service import create_temporary_output_path, is_retryable_provider_error, is_task_stale


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


def test_retryable_provider_error_for_timeout_and_connection_cases() -> None:
    assert is_retryable_provider_error(TimeoutError("timeout")) is True
    assert is_retryable_provider_error(ConnectionError("connection")) is True
    assert is_retryable_provider_error(OSError("os")) is True
    assert is_retryable_provider_error(httpx.ReadTimeout("read timeout")) is True


def test_retryable_provider_error_for_httpx_status_codes() -> None:
    request = httpx.Request("GET", "https://example.com")
    retryable_response = httpx.Response(503, request=request)
    non_retryable_response = httpx.Response(400, request=request)

    assert is_retryable_provider_error(httpx.HTTPStatusError("retryable", request=request, response=retryable_response)) is True
    assert is_retryable_provider_error(httpx.HTTPStatusError("non-retryable", request=request, response=non_retryable_response)) is False


def test_retryable_provider_error_excludes_business_and_configuration_failures() -> None:
    assert is_retryable_provider_error(AppError("videos.template.unavailable")) is False
    assert is_retryable_provider_error(PermissionDeniedError("videos.short.permissionDenied")) is False
    assert is_retryable_provider_error(FileNotFoundError("missing")) is False
    assert is_retryable_provider_error(RuntimeError("当前仓库还未接入正式 Seedance 客户端")) is False
    assert is_retryable_provider_error(RuntimeError("当前 Seedance HTTP provider 已支持任务轮询与结果下载骨架，但本地图片到远端输入引用的接入尚未完成。")) is False
