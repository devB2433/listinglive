"""
管理后台 dashboard 统计服务
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.subscription import Subscription
from backend.models.user import User
from backend.models.video_task import VideoTask

ACTIVE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")
PROCESSING_TASK_STATUSES = (
    "queued",
    "processing",
    "merging",
    "submitting",
    "submitted",
    "provider_processing",
    "finalizing",
)


def _day_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(timezone.utc)
    start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _build_day_series(rows: list[tuple], *, days: int) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    values = {row[0].isoformat(): int(row[1]) for row in rows}
    points: list[dict] = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        points.append({"date": day.isoformat(), "value": values.get(day.isoformat(), 0)})
    return points


async def get_admin_dashboard_summary(db: AsyncSession) -> dict:
    today_start, tomorrow_start = _day_bounds()

    total_users = int((await db.execute(select(func.count(User.id)))).scalar_one() or 0)
    new_users_today = int(
        (
            await db.execute(
                select(func.count(User.id)).where(User.created_at >= today_start, User.created_at < tomorrow_start)
            )
        ).scalar_one()
        or 0
    )
    tasks_today = int(
        (
            await db.execute(
                select(func.count(VideoTask.id)).where(VideoTask.created_at >= today_start, VideoTask.created_at < tomorrow_start)
            )
        ).scalar_one()
        or 0
    )
    succeeded_today = int(
        (
            await db.execute(
                select(func.count(VideoTask.id)).where(
                    VideoTask.finished_at >= today_start,
                    VideoTask.finished_at < tomorrow_start,
                    VideoTask.status == "succeeded",
                )
            )
        ).scalar_one()
        or 0
    )
    failed_today = int(
        (
            await db.execute(
                select(func.count(VideoTask.id)).where(
                    VideoTask.finished_at >= today_start,
                    VideoTask.finished_at < tomorrow_start,
                    VideoTask.status == "failed",
                )
            )
        ).scalar_one()
        or 0
    )
    processing_now = int(
        (
            await db.execute(select(func.count(VideoTask.id)).where(VideoTask.status.in_(PROCESSING_TASK_STATUSES)))
        ).scalar_one()
        or 0
    )
    active_subscriptions = int(
        (
            await db.execute(select(func.count(Subscription.id)).where(Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES)))
        ).scalar_one()
        or 0
    )

    return {
        "total_users": total_users,
        "new_users_today": new_users_today,
        "tasks_today": tasks_today,
        "succeeded_today": succeeded_today,
        "failed_today": failed_today,
        "processing_now": processing_now,
        "active_subscriptions": active_subscriptions,
    }


async def get_admin_dashboard_daily_stats(db: AsyncSession, *, days: int = 30) -> dict:
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)

    user_rows = list(
        (
            await db.execute(
                select(func.date(User.created_at), func.count(User.id))
                .where(User.created_at >= since)
                .group_by(func.date(User.created_at))
                .order_by(func.date(User.created_at).asc())
            )
        ).all()
    )
    task_rows = list(
        (
            await db.execute(
                select(func.date(VideoTask.created_at), func.count(VideoTask.id))
                .where(VideoTask.created_at >= since)
                .group_by(func.date(VideoTask.created_at))
                .order_by(func.date(VideoTask.created_at).asc())
            )
        ).all()
    )

    return {
        "new_users": _build_day_series(user_rows, days=days),
        "tasks_created": _build_day_series(task_rows, days=days),
    }
