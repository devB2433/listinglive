"""
统一的套餐权限判定服务
"""
from backend.core.api_errors import AppError
from backend.core.entitlements import (
    ACCESS_TIER_BASIC,
    ACCESS_TIER_NONE,
    ACCESS_TIER_PRO,
    ACCESS_TIER_SIGNUP_BONUS,
    ACCESS_TIER_ULTIMATE,
    ENTITLEMENTS_BY_TIER,
    PLAN_TYPE_BASIC,
    PLAN_TYPE_PRO,
    PLAN_TYPE_ULTIMATE,
    AccessContext,
    CapabilityLimits,
)
from backend.models.subscription import Subscription
from backend.services.quota_service import get_quota_snapshot


class PermissionDeniedError(AppError):
    """当前账号没有使用该能力的权限。"""

    def __init__(self, code: str) -> None:
        super().__init__(code=code, status_code=403)


def resolve_access_tier(subscription: Subscription | None, signup_bonus_remaining: int) -> str:
    if subscription is not None:
        if subscription.plan_type == PLAN_TYPE_BASIC:
            return ACCESS_TIER_BASIC
        if subscription.plan_type == PLAN_TYPE_PRO:
            return ACCESS_TIER_PRO
        if subscription.plan_type == PLAN_TYPE_ULTIMATE:
            return ACCESS_TIER_ULTIMATE
    if signup_bonus_remaining > 0:
        return ACCESS_TIER_SIGNUP_BONUS
    return ACCESS_TIER_NONE


def get_tier_limits(access_tier: str, *, storage_days_display: int | None) -> CapabilityLimits:
    base_limits = ENTITLEMENTS_BY_TIER[access_tier].limits
    return CapabilityLimits(
        short_fixed_duration_seconds=base_limits.short_fixed_duration_seconds,
        short_duration_editable=base_limits.short_duration_editable,
        allowed_resolutions=base_limits.allowed_resolutions,
        allowed_aspect_ratios=base_limits.allowed_aspect_ratios,
        storage_days_display=storage_days_display,
    )


def build_access_context_from_snapshot(snapshot: dict) -> AccessContext:
    subscription = snapshot["subscription"]
    access_tier = resolve_access_tier(subscription, snapshot["signup_bonus_remaining"])
    tier_entitlement = ENTITLEMENTS_BY_TIER[access_tier]
    storage_days_display = subscription.storage_days if subscription is not None else None

    return AccessContext(
        access_tier=access_tier,
        subscription_plan_type=subscription.plan_type if subscription is not None else None,
        subscription_status=getattr(subscription, "status", None) if subscription is not None else None,
        subscription_cancel_at_period_end=getattr(subscription, "cancel_at_period_end", False)
        if subscription is not None
        else False,
        subscription_current_period_end=getattr(subscription, "current_period_end", None) if subscription is not None else None,
        subscription_remaining=snapshot["subscription_remaining"],
        package_remaining=snapshot["package_remaining"],
        paid_package_remaining=snapshot["paid_package_remaining"],
        signup_bonus_remaining=snapshot["signup_bonus_remaining"],
        total_available=snapshot["total_available"],
        capabilities=tuple(sorted(tier_entitlement.capabilities)),
        limits=get_tier_limits(access_tier, storage_days_display=storage_days_display),
        can_purchase_quota_package="buy_quota_package" in tier_entitlement.capabilities,
    )


async def build_user_access_context(db, user_id) -> AccessContext:
    snapshot = await get_quota_snapshot(db, user_id)
    return build_access_context_from_snapshot(snapshot)


def has_capability(context: AccessContext, capability: str) -> bool:
    return capability in context.capabilities

