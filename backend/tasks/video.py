"""
视频任务
"""
import asyncio
import atexit
from collections.abc import Coroutine
from typing import Any

from backend.services.video_service import (
    cleanup_expired_video_files,
    process_long_video_task,
    process_short_video_task,
    reconcile_stale_video_tasks,
)
from backend.tasks.celery_app import celery_app

_worker_event_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_event_loop() -> asyncio.AbstractEventLoop:
    global _worker_event_loop
    if _worker_event_loop is None or _worker_event_loop.is_closed():
        _worker_event_loop = asyncio.new_event_loop()
    return _worker_event_loop


def _run_in_worker_event_loop(coro: Coroutine[Any, Any, Any]) -> Any:
    # Celery 在 Windows 上使用 solo pool 时会重复执行同步 task 包装器。
    # 复用同一个事件循环，避免 asyncpg 连接池绑定到已关闭的 loop。
    loop = _get_worker_event_loop()
    asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@atexit.register
def _close_worker_event_loop() -> None:
    global _worker_event_loop
    if _worker_event_loop is None or _worker_event_loop.is_closed():
        return
    _worker_event_loop.close()
    _worker_event_loop = None


@celery_app.task(name="video.process_short_video_task")
def process_short_video_task_job(task_id: str) -> None:
    _run_in_worker_event_loop(process_short_video_task(task_id))


@celery_app.task(name="video.process_long_video_task")
def process_long_video_task_job(task_id: str) -> None:
    _run_in_worker_event_loop(process_long_video_task(task_id))


@celery_app.task(name="video.reconcile_stale_video_tasks")
def reconcile_stale_video_tasks_job() -> None:
    _run_in_worker_event_loop(reconcile_stale_video_tasks())


@celery_app.task(name="video.cleanup_expired_video_files")
def cleanup_expired_video_files_job() -> None:
    _run_in_worker_event_loop(cleanup_expired_video_files())
