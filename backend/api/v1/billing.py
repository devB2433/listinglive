"""
套餐与配额路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db
from backend.models.user import User
from backend.schemas.billing import CapabilityLimitsOut, QuotaPackagePlanOut, QuotaSnapshotOut, SubscriptionPlanOut
from backend.services.entitlement_service import build_user_access_context
from backend.services.quota_service import (
    list_active_quota_package_plans,
    list_active_subscription_plans,
)

router = APIRouter()


@router.get('/plans', response_model=list[SubscriptionPlanOut])
async def get_subscription_plans(db: AsyncSession = Depends(get_db)) -> list[SubscriptionPlanOut]:
    return await list_active_subscription_plans(db)


@router.get('/quota-packages/plans', response_model=list[QuotaPackagePlanOut])
async def get_quota_package_plans(db: AsyncSession = Depends(get_db)) -> list[QuotaPackagePlanOut]:
    return await list_active_quota_package_plans(db)


@router.get('/quota', response_model=QuotaSnapshotOut)
async def get_my_quota(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuotaSnapshotOut:
    context = await build_user_access_context(db, user.id)
    return QuotaSnapshotOut(
        subscription_plan_type=context.subscription_plan_type,
        subscription_remaining=context.subscription_remaining,
        package_remaining=context.package_remaining,
        paid_package_remaining=context.paid_package_remaining,
        signup_bonus_remaining=context.signup_bonus_remaining,
        total_available=context.total_available,
        access_tier=context.access_tier,
        capabilities=list(context.capabilities),
        can_purchase_quota_package=context.can_purchase_quota_package,
        limits=CapabilityLimitsOut(
            short_fixed_duration_seconds=context.limits.short_fixed_duration_seconds,
            short_duration_editable=context.limits.short_duration_editable,
            allowed_resolutions=list(context.limits.allowed_resolutions),
            allowed_aspect_ratios=list(context.limits.allowed_aspect_ratios),
            storage_days_display=context.limits.storage_days_display,
        ),
    )
