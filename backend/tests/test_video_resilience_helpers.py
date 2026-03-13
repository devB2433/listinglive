from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy.exc import MissingGreenlet, SQLAlchemyError

from backend.core.api_errors import AppError
from backend.services.entitlement_service import PermissionDeniedError
from backend.services.video_service import (
    TASK_ERROR_SOURCE_INTERNAL,
    TASK_ERROR_SOURCE_PROVIDER,
    TASK_ERROR_SOURCE_QUEUE,
    build_task_failure_info,
    create_temporary_output_path,
    get_task_stale_seconds,
    is_retryable_provider_error,
    is_task_stale,
)


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


def test_get_task_stale_seconds_uses_full_window_for_long_tasks_on_startup() -> None:
    long_task = type("Task", (), {"task_type": "long"})()

    assert get_task_stale_seconds(long_task, startup_mode=True) == 1800


def test_get_task_stale_seconds_keeps_short_startup_window_for_short_tasks() -> None:
    short_task = type("Task", (), {"task_type": "short"})()

    assert get_task_stale_seconds(short_task, startup_mode=True) == 120


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


def test_build_task_failure_info_preserves_app_error_code() -> None:
    failure = build_task_failure_info(AppError("videos.task.queueUnavailable"))

    assert failure.code == "videos.task.queueUnavailable"
    assert failure.source == TASK_ERROR_SOURCE_QUEUE
    assert failure.retryable is True
    assert failure.message == "videos.task.queueUnavailable"


def test_build_task_failure_info_wraps_plain_message_with_fallback_code() -> None:
    failure = build_task_failure_info("第三方服务爆了", fallback_code="videos.provider.failed", source_hint=TASK_ERROR_SOURCE_PROVIDER)

    assert failure.code == "videos.provider.failed"
    assert failure.source == TASK_ERROR_SOURCE_PROVIDER
    assert failure.detail == "第三方服务爆了"
    assert failure.retryable is True


def test_build_task_failure_info_maps_runtime_timeout_message() -> None:
    failure = build_task_failure_info(RuntimeError("视频生成任务轮询超时: abc123"))

    assert failure.code == "videos.provider.timeout"
    assert failure.source == TASK_ERROR_SOURCE_PROVIDER
    assert failure.detail == "视频生成任务轮询超时: abc123"
    assert failure.retryable is True


def test_build_task_failure_info_uses_internal_fallback_for_unknown_exception() -> None:
    failure = build_task_failure_info(Exception("boom"))

    assert failure.code == "videos.internal.unexpected"
    assert failure.source == TASK_ERROR_SOURCE_INTERNAL
    assert failure.detail == "boom"
    assert failure.retryable is True


def test_build_task_failure_info_maps_missing_greenlet_to_async_context_code() -> None:
    failure = build_task_failure_info(MissingGreenlet("greenlet_spawn has not been called"))

    assert failure.code == "videos.internal.asyncContext"
    assert failure.source == TASK_ERROR_SOURCE_INTERNAL
    assert failure.retryable is False


def test_build_task_failure_info_maps_sqlalchemy_errors_to_persistence_failed() -> None:
    failure = build_task_failure_info(SQLAlchemyError("db write failed"))

    assert failure.code == "videos.internal.persistenceFailed"
    assert failure.source == TASK_ERROR_SOURCE_INTERNAL
    assert failure.detail == "db write failed"
    assert failure.retryable is False
