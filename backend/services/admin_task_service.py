"""
管理后台任务服务
"""
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.models.user import User
from backend.models.video_task import VideoTask
from backend.services.video_service import get_task_duration_snapshot


def _serialize_task_row(task: VideoTask, user: User) -> dict:
    queue_wait_seconds, processing_seconds, total_elapsed_seconds = get_task_duration_snapshot(task)
    return {
        "id": task.id,
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "task_type": task.task_type,
        "service_tier": task.service_tier,
        "status": task.status,
        "provider_name": task.provider_name,
        "provider_status": task.provider_status,
        "planned_quota_consumed": task.planned_quota_consumed,
        "charged_quota_consumed": task.charged_quota_consumed,
        "charge_status": task.charge_status,
        "queued_at": task.queued_at,
        "processing_started_at": task.processing_started_at,
        "finished_at": task.finished_at,
        "queue_wait_seconds": queue_wait_seconds,
        "processing_seconds": processing_seconds,
        "total_elapsed_seconds": total_elapsed_seconds,
        "error_message": task.error_message,
        "created_at": task.created_at,
        "resolution": task.resolution,
        "aspect_ratio": task.aspect_ratio,
        "duration_seconds": task.duration_seconds,
        "prompt": task.prompt,
        "video_key": task.video_key,
    }


async def list_admin_tasks(
    db: AsyncSession,
    *,
    query: str | None = None,
    status: str | None = None,
    task_type: str | None = None,
    service_tier: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    filters = []
    normalized_query = query.strip().lower() if query else None
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(or_(func.lower(User.username).like(pattern), func.lower(User.email).like(pattern)))
    if status:
        filters.append(VideoTask.status == status)
    if task_type:
        filters.append(VideoTask.task_type == task_type)
    if service_tier:
        filters.append(VideoTask.service_tier == service_tier)

    total_stmt = select(func.count(VideoTask.id)).join(User, User.id == VideoTask.user_id)
    items_stmt = (
        select(VideoTask, User)
        .join(User, User.id == VideoTask.user_id)
        .order_by(VideoTask.created_at.desc())
    )
    if filters:
        total_stmt = total_stmt.where(*filters)
        items_stmt = items_stmt.where(*filters)

    total = int((await db.execute(total_stmt)).scalar_one() or 0)
    rows = list((await db.execute(items_stmt.offset((page - 1) * page_size).limit(page_size))).all())
    items = [_serialize_task_row(task, user) for task, user in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def get_admin_task_or_404(db: AsyncSession, task_id) -> dict:
    stmt = select(VideoTask, User).join(User, User.id == VideoTask.user_id).where(VideoTask.id == task_id)
    row = (await db.execute(stmt)).first()
    if row is None:
        raise AppError("admin.tasks.notFound", status_code=404)
    task, user = row
    return _serialize_task_row(task, user)
