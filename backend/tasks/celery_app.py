"""
Celery 应用：Redis 为 broker
"""
from celery import Celery

from backend.core.config import settings

celery_app = Celery(
    "listinglive",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["backend.tasks.hello", "backend.tasks.video"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "video.process_short_video_task": {"queue": "video-io"},
        "video.process_long_video_task": {"queue": "video-io"},
        "video.submit_flex_short_video_task": {"queue": "video-io"},
        "video.poll_flex_tasks": {"queue": "video-io"},
        "video.finalize_flex_short_video_task": {"queue": "video-cpu"},
        "video.finalize_standard_short_video_task": {"queue": "video-cpu"},
        "video.finalize_long_video_task_cpu": {"queue": "video-cpu"},
    },
)

# 定时任务：定期检查异常卡住的任务
celery_app.conf.beat_schedule = {
    "reconcile-stale-video-tasks": {
        "task": "video.reconcile_stale_video_tasks",
        "schedule": 300.0,  # 每 5 分钟检查一次
    },
    "poll-flex-video-tasks": {
        "task": "video.poll_flex_tasks",
        "schedule": 30.0,
    },
    "cleanup-expired-video-files": {
        "task": "video.cleanup_expired_video_files",
        "schedule": 3600.0,  # 每小时清理过期文件
    },
}
