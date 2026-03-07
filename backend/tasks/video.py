"""
视频任务
"""
import asyncio

from backend.services.video_service import (
    cleanup_expired_video_files,
    process_long_video_task,
    process_short_video_task,
    reconcile_stale_video_tasks,
)
from backend.tasks.celery_app import celery_app


@celery_app.task(name="video.process_short_video_task")
def process_short_video_task_job(task_id: str) -> None:
    asyncio.run(process_short_video_task(task_id))


@celery_app.task(name="video.process_long_video_task")
def process_long_video_task_job(task_id: str) -> None:
    asyncio.run(process_long_video_task(task_id))


@celery_app.task(name="video.reconcile_stale_video_tasks")
def reconcile_stale_video_tasks_job() -> None:
    asyncio.run(reconcile_stale_video_tasks())


@celery_app.task(name="video.cleanup_expired_video_files")
def cleanup_expired_video_files_job() -> None:
    asyncio.run(cleanup_expired_video_files())
