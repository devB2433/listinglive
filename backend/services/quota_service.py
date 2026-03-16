"""
套餐与配额服务
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.entitlements import PLAN_TIER_ORDER
from backend.models.quota import QuotaPackage, QuotaPackagePlan
from backend.models.subscription import Subscription, SubscriptionPlan
from backend.models.video_task import VideoTask

SIGNUP_BONUS_PACKAGE_TYPE = "signup_bonus"
SIGNUP_BONUS_QUOTA = 5
INVITE_BONUS_PACKAGE_TYPE = "invite_bonus"
INVITE_BONUS_QUOTA = 15
ACTIVE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")
LOCAL_SIGNUP_TRIAL_PLAN_TYPE = "pro"
LOCAL_SIGNUP_TRIAL_STATUS = "trialing"
LOCAL_SIGNUP_TRIAL_DAYS = 7
TASK_CHARGE_STATUS_PENDING = "pending"
TASK_CHARGE_STATUS_CHARGED = "charged"
TASK_CHARGE_STATUS_SKIPPED = "skipped"
MIN_DATETIME_UTC = datetime.min.replace(tzinfo=timezone.utc)
MAX_DATETIME_UTC = datetime.max.replace(tzinfo=timezone.utc)


@dataclass
class QuotaChargeBreakdown:
    subscription_used: int = 0
    paid_package_used: int = 0
    signup_bonus_used: int = 0
    invite_bonus_used: int = 0

    @property
    def total_used(self) -> int:
        return self.subscription_used + self.paid_package_used + self.signup_bonus_used + self.invite_bonus_used


class QuotaInsufficientError(AppError):
    def __init__(
        self,
        *,
        required_quota: int,
        available_quota: int,
        pending_reserved: int = 0,
        task_kind: str | None = None,
    ) -> None:
        super().__init__(code="billing.quota.insufficient", status_code=400)
        self.required_quota = max(int(required_quota), 0)
        self.available_quota = max(int(available_quota), 0)
        self.pending_reserved = max(int(pending_reserved), 0)
        self.task_kind = task_kind

    def to_detail(self) -> dict:
        detail = {
            "code": self.code,
            "message": "可用配额不足",
            "required_quota": self.required_quota,
            "available_quota": self.available_quota,
            "pending_reserved": self.pending_reserved,
        }
        if self.task_kind:
            detail["task_kind"] = self.task_kind
        return detail


def get_quota_package_consume_priority(package_type: str | None) -> int:
    if package_type == SIGNUP_BONUS_PACKAGE_TYPE:
        return 1
    if package_type == INVITE_BONUS_PACKAGE_TYPE:
        return 2
    return 0


def sort_quota_packages_for_consumption(packages: list[QuotaPackage]) -> list[QuotaPackage]:
    return sorted(
        packages,
        key=lambda package: (
            get_quota_package_consume_priority(getattr(package, "package_type", None)),
            getattr(package, "expires_at", None) is None,
            getattr(package, "expires_at", None) or MAX_DATETIME_UTC,
            getattr(package, "created_at", None) or MIN_DATETIME_UTC,
        ),
    )


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


async def ensure_invite_bonus(db: AsyncSession, user_id: UUID) -> None:
    stmt = select(QuotaPackage).where(
        QuotaPackage.user_id == user_id,
        QuotaPackage.package_type == INVITE_BONUS_PACKAGE_TYPE,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return
    db.add(
        QuotaPackage(
            user_id=user_id,
            package_type=INVITE_BONUS_PACKAGE_TYPE,
            quota_total=INVITE_BONUS_QUOTA,
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


def is_billing_managed_subscription(subscription: Subscription | None) -> bool:
    return bool(getattr(subscription, "stripe_subscription_id", None))


def is_local_trial_subscription(subscription: Subscription | None) -> bool:
    return bool(
        subscription is not None
        and getattr(subscription, "status", None) == LOCAL_SIGNUP_TRIAL_STATUS
        and not is_billing_managed_subscription(subscription)
    )


def pick_current_subscription(subscriptions: list[Subscription], *, now: datetime | None = None) -> Subscription | None:
    current_time = now or datetime.now(timezone.utc)
    ordered = sorted(
        subscriptions,
        key=lambda sub: (
            is_billing_managed_subscription(sub),
            PLAN_TIER_ORDER.get(getattr(sub, "plan_type", None), 0),
            sub.current_period_start or MIN_DATETIME_UTC,
            sub.current_period_end or MAX_DATETIME_UTC,
            sub.created_at or MIN_DATETIME_UTC,
        ),
        reverse=True,
    )
    for sub in ordered:
        if sub.current_period_end is None or sub.current_period_end >= current_time:
            return sub
    return None


async def get_active_subscription(db: AsyncSession, user_id: UUID) -> Subscription | None:
    stmt = select(Subscription).where(
        Subscription.user_id == user_id,
        Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
    )
    subs = list((await db.execute(stmt)).scalars().all())
    return pick_current_subscription(subs)


async def get_active_billing_subscription(db: AsyncSession, user_id: UUID) -> Subscription | None:
    stmt = select(Subscription).where(
        Subscription.user_id == user_id,
        Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
        Subscription.stripe_subscription_id.is_not(None),
    )
    subs = list((await db.execute(stmt)).scalars().all())
    return pick_current_subscription(subs)


async def ensure_signup_pro_trial_subscription(db: AsyncSession, user_id: UUID) -> Subscription:
    existing_stmt = select(Subscription).where(
        Subscription.user_id == user_id,
        Subscription.status == LOCAL_SIGNUP_TRIAL_STATUS,
        Subscription.stripe_subscription_id.is_(None),
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing is not None:
        return existing

    now = datetime.now(timezone.utc)
    plan_stmt = select(SubscriptionPlan).where(
        SubscriptionPlan.plan_type == LOCAL_SIGNUP_TRIAL_PLAN_TYPE,
        SubscriptionPlan.is_active.is_(True),
    )
    plan = (await db.execute(plan_stmt)).scalar_one_or_none()

    subscription = Subscription(
        user_id=user_id,
        subscription_plan_id=plan.id if plan is not None else None,
        plan_type=LOCAL_SIGNUP_TRIAL_PLAN_TYPE,
        status=LOCAL_SIGNUP_TRIAL_STATUS,
        quota_per_month=0,
        quota_used=0,
        storage_days=plan.storage_days if plan is not None else 0,
        stripe_subscription_id=None,
        stripe_customer_id=None,
        stripe_price_id=None,
        cancel_at_period_end=False,
        canceled_at=None,
        latest_invoice_id=None,
        last_stripe_event_id=None,
        current_period_start=now,
        current_period_end=now + timedelta(days=LOCAL_SIGNUP_TRIAL_DAYS),
    )
    db.add(subscription)
    await db.flush()
    return subscription


async def get_quota_snapshot(db: AsyncSession, user_id: UUID) -> dict:
    subscription = await get_active_subscription(db, user_id)
    now = datetime.now(timezone.utc)
    package_stmt = select(QuotaPackage).where(QuotaPackage.user_id == user_id)
    packages = list((await db.execute(package_stmt)).scalars().all())

    valid_packages: list[QuotaPackage] = []
    package_remaining = 0
    paid_package_remaining = 0
    signup_bonus_remaining = 0
    invite_bonus_remaining = 0
    for package in packages:
        if package.expires_at is not None and package.expires_at < now:
            continue
        remaining = max(package.quota_total - package.quota_used, 0)
        valid_packages.append(package)
        package_remaining += remaining
        if package.package_type == SIGNUP_BONUS_PACKAGE_TYPE:
            signup_bonus_remaining += remaining
        elif package.package_type == INVITE_BONUS_PACKAGE_TYPE:
            invite_bonus_remaining += remaining
        else:
            paid_package_remaining += remaining

    subscription_remaining = 0
    if subscription:
        subscription_remaining = max(subscription.quota_per_month - subscription.quota_used, 0)

    total_available = subscription_remaining + package_remaining
    pending_reserved = await get_pending_task_charge_amount(db, user_id)
    schedulable_available = max(total_available - pending_reserved, 0)

    return {
        "subscription": subscription,
        "subscription_is_local_trial": is_local_trial_subscription(subscription),
        "subscription_is_billing_managed": is_billing_managed_subscription(subscription),
        "subscription_remaining": subscription_remaining,
        "package_remaining": package_remaining,
        "paid_package_remaining": paid_package_remaining,
        "signup_bonus_remaining": signup_bonus_remaining,
        "invite_bonus_remaining": invite_bonus_remaining,
        "total_available": total_available,
        "pending_reserved": pending_reserved,
        "schedulable_available": schedulable_available,
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


async def check_quota_available(
    db: AsyncSession,
    user_id: UUID,
    amount: int,
    *,
    exclude_task_id: UUID | None = None,
    task_kind: str | None = None,
) -> int:
    snapshot = await get_quota_snapshot(db, user_id)
    pending_reserved = (
        snapshot["pending_reserved"]
        if exclude_task_id is None and "pending_reserved" in snapshot
        else await get_pending_task_charge_amount(db, user_id, exclude_task_id=exclude_task_id)
    )
    schedulable_available = max(snapshot["total_available"] - pending_reserved, 0)
    if schedulable_available < amount:
        raise QuotaInsufficientError(
            required_quota=amount,
            available_quota=schedulable_available,
            pending_reserved=pending_reserved,
            task_kind=task_kind,
        )
    return schedulable_available


async def consume_quota(db: AsyncSession, user_id: UUID, amount: int) -> QuotaChargeBreakdown:
    snapshot = await get_quota_snapshot(db, user_id)
    if snapshot["total_available"] < amount:
        raise QuotaInsufficientError(
            required_quota=amount,
            available_quota=snapshot["total_available"],
            pending_reserved=snapshot.get("pending_reserved", 0),
        )

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

    packages = sort_quota_packages_for_consumption(snapshot["packages"])
    for package in packages:
        left = max(package.quota_total - package.quota_used, 0)
        use = min(left, remaining)
        package.quota_used += use
        remaining -= use
        if package.package_type == SIGNUP_BONUS_PACKAGE_TYPE:
            breakdown.signup_bonus_used += use
        elif package.package_type == INVITE_BONUS_PACKAGE_TYPE:
            breakdown.invite_bonus_used += use
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
        elif package.package_type == INVITE_BONUS_PACKAGE_TYPE:
            breakdown.invite_bonus_used += give_back
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
