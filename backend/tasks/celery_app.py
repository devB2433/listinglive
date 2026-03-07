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
)
