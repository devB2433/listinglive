"""
示例任务：验收 Celery 接入
"""
from backend.tasks.celery_app import celery_app


@celery_app.task
def hello_task(name: str = "world") -> str:
    return f"Hello, {name}!"
