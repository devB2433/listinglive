"""
视频任务
"""
import asyncio

from backend.services.video_service import process_long_video_task, process_short_video_task
from backend.tasks.celery_app import celery_app


@celery_app.task(name="video.process_short_video_task")
def process_short_video_task_job(task_id: str) -> None:
    asyncio.run(process_short_video_task(task_id))


@celery_app.task(name="video.process_long_video_task")
def process_long_video_task_job(task_id: str) -> None:
    asyncio.run(process_long_video_task(task_id))
