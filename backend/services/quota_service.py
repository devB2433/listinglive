"""
套餐与配额服务
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.quota import QuotaPackage, QuotaPackagePlan
from backend.models.subscription import Subscription, SubscriptionPlan
from backend.models.video_task import VideoTask

SIGNUP_BONUS_PACKAGE_TYPE = "signup_bonus"
SIGNUP_BONUS_QUOTA = 5
ACTIVE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")
TASK_CHARGE_STATUS_PENDING = "pending"
TASK_CHARGE_STATUS_CHARGED = "charged"
TASK_CHARGE_STATUS_SKIPPED = "skipped"


@dataclass
class QuotaChargeBreakdown:
    subscription_used: int = 0
    paid_package_used: int = 0
    signup_bonus_used: int = 0

    @property
    def total_used(self) -> int:
        return self.subscription_used + self.paid_package_used + self.signup_bonus_used


async def ensure_signup_bonus(db: AsyncSession, user_id: UUID) -> None:
    stmt = select(QuotaPackage).where(
        QuotaPackage.user_id == user_id,
        QuotaPackage.package_type == SIGNUP_BONUS_PACKAGE_TYPE,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return
    db.add(
        QuotaPackage(
            user_id=user_id,
            package_type=SIGNUP_BONUS_PACKAGE_TYPE,
            quota_total=SIGNUP_BONUS_QUOTA,
            quota_used=0,
            expires_at=None,
            stripe_payment_intent_id=None,
        )
    )
    await db.flush()


async def list_active_subscription_plans(db: AsyncSession) -> list[SubscriptionPlan]:
    stmt = select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True)).order_by(SubscriptionPlan.price_cad.asc())
    return list((await db.execute(stmt)).scalars().all())


async def list_active_quota_package_plans(db: AsyncSession) -> list[QuotaPackagePlan]:
    stmt = select(QuotaPackagePlan).where(QuotaPackagePlan.is_active.is_(True)).order_by(QuotaPackagePlan.price_cad.asc())
    return list((await db.execute(stmt)).scalars().all())


async def get_active_subscription(db: AsyncSession, user_id: UUID) -> Subscription | None:
    now = datetime.now(timezone.utc)
    stmt = select(Subscription).where(
        Subscription.user_id == user_id,
        Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
    ).order_by(Subscription.created_at.desc())
    subs = list((await db.execute(stmt)).scalars().all())
    for sub in subs:
        if sub.current_period_end is None or sub.current_period_end >= now:
            return sub
    return None


async def get_quota_snapshot(db: AsyncSession, user_id: UUID) -> dict:
    subscription = await get_active_subscription(db, user_id)
    now = datetime.now(timezone.utc)
    package_stmt = select(QuotaPackage).where(QuotaPackage.user_id == user_id)
    packages = list((await db.execute(package_stmt)).scalars().all())

    valid_packages: list[QuotaPackage] = []
    package_remaining = 0
    paid_package_remaining = 0
    signup_bonus_remaining = 0
    for package in packages:
        if package.expires_at is not None and package.expires_at < now:
            continue
        remaining = max(package.quota_total - package.quota_used, 0)
        valid_packages.append(package)
        package_remaining += remaining
        if package.package_type == SIGNUP_BONUS_PACKAGE_TYPE:
            signup_bonus_remaining += remaining
        else:
            paid_package_remaining += remaining

    subscription_remaining = 0
    if subscription:
        subscription_remaining = max(subscription.quota_per_month - subscription.quota_used, 0)

    return {
        "subscription": subscription,
        "subscription_remaining": subscription_remaining,
        "package_remaining": package_remaining,
        "paid_package_remaining": paid_package_remaining,
        "signup_bonus_remaining": signup_bonus_remaining,
        "total_available": subscription_remaining + package_remaining,
        "packages": valid_packages,
    }


async def get_pending_task_charge_amount(db: AsyncSession, user_id: UUID, *, exclude_task_id: UUID | None = None) -> int:
    stmt = select(func.coalesce(func.sum(VideoTask.planned_quota_consumed - VideoTask.charged_quota_consumed), 0)).where(
        VideoTask.user_id == user_id,
        VideoTask.charge_status == TASK_CHARGE_STATUS_PENDING,
    )
    if exclude_task_id is not None:
        stmt = stmt.where(VideoTask.id != exclude_task_id)
    value = (await db.execute(stmt)).scalar_one()
    return max(int(value or 0), 0)


async def check_quota_available(db: AsyncSession, user_id: UUID, amount: int, *, exclude_task_id: UUID | None = None) -> int:
    snapshot = await get_quota_snapshot(db, user_id)
    pending_reserved = await get_pending_task_charge_amount(db, user_id, exclude_task_id=exclude_task_id)
    schedulable_available = max(snapshot["total_available"] - pending_reserved, 0)
    if schedulable_available < amount:
        raise ValueError("可用配额不足")
    return schedulable_available


async def consume_quota(db: AsyncSession, user_id: UUID, amount: int) -> QuotaChargeBreakdown:
    snapshot = await get_quota_snapshot(db, user_id)
    if snapshot["total_available"] < amount:
        raise ValueError("可用配额不足")

    remaining = amount
    breakdown = QuotaChargeBreakdown()
    subscription = snapshot["subscription"]
    if subscription is not None:
        sub_left = max(subscription.quota_per_month - subscription.quota_used, 0)
        use = min(sub_left, remaining)
        subscription.quota_used += use
        remaining -= use
        breakdown.subscription_used += use

    if remaining <= 0:
        return breakdown

    packages = sorted(snapshot["packages"], key=lambda p: (p.expires_at is None, p.expires_at or datetime.max.replace(tzinfo=timezone.utc)))
    for package in packages:
        left = max(package.quota_total - package.quota_used, 0)
        use = min(left, remaining)
        package.quota_used += use
        remaining -= use
        if package.package_type == SIGNUP_BONUS_PACKAGE_TYPE:
            breakdown.signup_bonus_used += use
        else:
            breakdown.paid_package_used += use
        if remaining <= 0:
            break
    return breakdown


async def refund_quota(db: AsyncSession, user_id: UUID, amount: int) -> QuotaChargeBreakdown:
    remaining = amount
    breakdown = QuotaChargeBreakdown()
    package_stmt = select(QuotaPackage).where(QuotaPackage.user_id == user_id).order_by(QuotaPackage.created_at.desc())
    packages = list((await db.execute(package_stmt)).scalars().all())
    for package in packages:
        if package.quota_used <= 0:
            continue
        give_back = min(package.quota_used, remaining)
        package.quota_used -= give_back
        remaining -= give_back
        if package.package_type == SIGNUP_BONUS_PACKAGE_TYPE:
            breakdown.signup_bonus_used += give_back
        else:
            breakdown.paid_package_used += give_back
        if remaining <= 0:
            return breakdown

    subscription = await get_active_subscription(db, user_id)
    if subscription and remaining > 0:
        give_back = min(subscription.quota_used, remaining)
        subscription.quota_used -= give_back
        breakdown.subscription_used += give_back
    return breakdown


async def get_task_charge_reconciliation(db: AsyncSession, user_id: UUID, *, limit: int = 100) -> dict:
    tasks_stmt = (
        select(VideoTask)
        .where(VideoTask.user_id == user_id)
        .order_by(VideoTask.created_at.desc())
        .limit(limit)
    )
    tasks = list((await db.execute(tasks_stmt)).scalars().all())

    summary_stmt = select(
        func.count(VideoTask.id),
        func.coalesce(func.sum(VideoTask.planned_quota_consumed), 0),
        func.coalesce(func.sum(VideoTask.charged_quota_consumed), 0),
        func.coalesce(
            func.sum(
                case(
                    (
                        (VideoTask.task_type == "short") & (VideoTask.status == "succeeded"),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        (VideoTask.task_type == "long") & (VideoTask.status == "succeeded"),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        (VideoTask.task_type == "long") & (VideoTask.status == "succeeded"),
                        VideoTask.planned_quota_consumed,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (VideoTask.charge_status == TASK_CHARGE_STATUS_PENDING, VideoTask.planned_quota_consumed),
                    else_=0,
                )
            ),
            0,
        ),
    ).where(VideoTask.user_id == user_id)
    (
        total_tasks,
        planned_total,
        charged_total,
        successful_short_tasks,
        successful_long_tasks,
        successful_long_segments,
        pending_reserved_total,
    ) = (await db.execute(summary_stmt)).one()

    return {
        "total_tasks": int(total_tasks or 0),
        "planned_total": int(planned_total or 0),
        "charged_total": int(charged_total or 0),
        "successful_short_tasks": int(successful_short_tasks or 0),
        "successful_long_tasks": int(successful_long_tasks or 0),
        "successful_long_segments": int(successful_long_segments or 0),
        "pending_reserved_total": int(pending_reserved_total or 0),
        "items": tasks,
    }
