"""
套餐与配额服务
"""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.quota import QuotaPackage, QuotaPackagePlan
from backend.models.subscription import Subscription, SubscriptionPlan

SIGNUP_BONUS_PACKAGE_TYPE = "signup_bonus"
SIGNUP_BONUS_QUOTA = 5


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
        Subscription.status == "active",
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


async def consume_quota(db: AsyncSession, user_id: UUID, amount: int) -> None:
    snapshot = await get_quota_snapshot(db, user_id)
    if snapshot["total_available"] < amount:
        raise ValueError("可用配额不足")

    remaining = amount
    subscription = snapshot["subscription"]
    if subscription is not None:
        sub_left = max(subscription.quota_per_month - subscription.quota_used, 0)
        use = min(sub_left, remaining)
        subscription.quota_used += use
        remaining -= use

    if remaining <= 0:
        return

    packages = sorted(snapshot["packages"], key=lambda p: (p.expires_at is None, p.expires_at or datetime.max.replace(tzinfo=timezone.utc)))
    for package in packages:
        left = max(package.quota_total - package.quota_used, 0)
        use = min(left, remaining)
        package.quota_used += use
        remaining -= use
        if remaining <= 0:
            break


async def refund_quota(db: AsyncSession, user_id: UUID, amount: int) -> None:
    remaining = amount
    package_stmt = select(QuotaPackage).where(QuotaPackage.user_id == user_id).order_by(QuotaPackage.created_at.desc())
    packages = list((await db.execute(package_stmt)).scalars().all())
    for package in packages:
        if package.quota_used <= 0:
            continue
        give_back = min(package.quota_used, remaining)
        package.quota_used -= give_back
        remaining -= give_back
        if remaining <= 0:
            return

    subscription = await get_active_subscription(db, user_id)
    if subscription and remaining > 0:
        give_back = min(subscription.quota_used, remaining)
        subscription.quota_used -= give_back
