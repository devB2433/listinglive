"""
统一的套餐权限矩阵
"""
from dataclasses import dataclass
from datetime import datetime

ACCESS_TIER_SIGNUP_BONUS = "signup_bonus"
ACCESS_TIER_BASIC = "basic"
ACCESS_TIER_PRO = "pro"
ACCESS_TIER_ULTIMATE = "ultimate"
ACCESS_TIER_NONE = "none"

CAPABILITY_SHORT_VIDEO_CREATE = "short_video_create"
CAPABILITY_MERGE_VIDEO_CREATE = "merge_video_create"
CAPABILITY_SCENE_TEMPLATE_SELECT = "scene_template_select"
CAPABILITY_RESOLUTION_SELECT = "resolution_select"
CAPABILITY_ASPECT_RATIO_SELECT = "aspect_ratio_select"
CAPABILITY_LOGO_WATERMARK = "logo_watermark"
CAPABILITY_TRANSITION_EFFECT = "transition_effect"
CAPABILITY_MERGE_PER_IMAGE_TEMPLATE = "merge_per_image_template"
CAPABILITY_MERGE_PER_SEGMENT_DURATION = "merge_per_segment_duration"
CAPABILITY_MERGE_DRAG_REORDER = "merge_drag_reorder"
CAPABILITY_DOWNLOAD_VIDEO = "download_video"
CAPABILITY_BUY_QUOTA_PACKAGE = "buy_quota_package"

PLAN_TYPE_BASIC = "basic"
PLAN_TYPE_PRO = "pro"
PLAN_TYPE_ULTIMATE = "ultimate"

PLAN_TIER_ORDER: dict[str, int] = {
    PLAN_TYPE_BASIC: 1,
    PLAN_TYPE_PRO: 2,
    PLAN_TYPE_ULTIMATE: 3,
}

ALL_RESOLUTIONS = ("1080p",)
ALL_ASPECT_RATIOS = ("16:9", "9:16", "1:1", "adaptive")
BASIC_SHORT_VIDEO_DURATION_SECONDS = 4

BASIC_FEATURE_CAPABILITIES = frozenset(
    {
        CAPABILITY_SHORT_VIDEO_CREATE,
        CAPABILITY_MERGE_VIDEO_CREATE,
        CAPABILITY_SCENE_TEMPLATE_SELECT,
        CAPABILITY_RESOLUTION_SELECT,
        CAPABILITY_ASPECT_RATIO_SELECT,
        CAPABILITY_LOGO_WATERMARK,
        CAPABILITY_DOWNLOAD_VIDEO,
    }
)

ADVANCED_FEATURE_CAPABILITIES = frozenset(
    {
        CAPABILITY_TRANSITION_EFFECT,
        CAPABILITY_MERGE_PER_IMAGE_TEMPLATE,
        CAPABILITY_MERGE_PER_SEGMENT_DURATION,
        CAPABILITY_MERGE_DRAG_REORDER,
    }
)


@dataclass(frozen=True)
class CapabilityLimits:
    short_fixed_duration_seconds: int | None
    short_duration_editable: bool
    allowed_resolutions: tuple[str, ...]
    allowed_aspect_ratios: tuple[str, ...]
    storage_days_display: int | None


@dataclass(frozen=True)
class TierEntitlement:
    capabilities: frozenset[str]
    limits: CapabilityLimits


@dataclass(frozen=True)
class AccessContext:
    access_tier: str
    subscription_plan_type: str | None
    subscription_status: str | None
    subscription_cancel_at_period_end: bool
    subscription_current_period_end: datetime | None
    subscription_remaining: int
    package_remaining: int
    paid_package_remaining: int
    signup_bonus_remaining: int
    total_available: int
    capabilities: tuple[str, ...]
    limits: CapabilityLimits
    can_purchase_quota_package: bool


ENTITLEMENTS_BY_TIER: dict[str, TierEntitlement] = {
    ACCESS_TIER_SIGNUP_BONUS: TierEntitlement(
        capabilities=frozenset(BASIC_FEATURE_CAPABILITIES | ADVANCED_FEATURE_CAPABILITIES | {CAPABILITY_BUY_QUOTA_PACKAGE}),
        limits=CapabilityLimits(
            short_fixed_duration_seconds=None,
            short_duration_editable=True,
            allowed_resolutions=ALL_RESOLUTIONS,
            allowed_aspect_ratios=ALL_ASPECT_RATIOS,
            storage_days_display=None,
        ),
    ),
    ACCESS_TIER_BASIC: TierEntitlement(
        capabilities=frozenset(BASIC_FEATURE_CAPABILITIES | {CAPABILITY_BUY_QUOTA_PACKAGE}),
        limits=CapabilityLimits(
            short_fixed_duration_seconds=BASIC_SHORT_VIDEO_DURATION_SECONDS,
            short_duration_editable=False,
            allowed_resolutions=ALL_RESOLUTIONS,
            allowed_aspect_ratios=ALL_ASPECT_RATIOS,
            storage_days_display=None,
        ),
    ),
    ACCESS_TIER_PRO: TierEntitlement(
        capabilities=frozenset(BASIC_FEATURE_CAPABILITIES | ADVANCED_FEATURE_CAPABILITIES | {CAPABILITY_BUY_QUOTA_PACKAGE}),
        limits=CapabilityLimits(
            short_fixed_duration_seconds=None,
            short_duration_editable=True,
            allowed_resolutions=ALL_RESOLUTIONS,
            allowed_aspect_ratios=ALL_ASPECT_RATIOS,
            storage_days_display=None,
        ),
    ),
    ACCESS_TIER_ULTIMATE: TierEntitlement(
        capabilities=frozenset(BASIC_FEATURE_CAPABILITIES | ADVANCED_FEATURE_CAPABILITIES | {CAPABILITY_BUY_QUOTA_PACKAGE}),
        limits=CapabilityLimits(
            short_fixed_duration_seconds=None,
            short_duration_editable=True,
            allowed_resolutions=ALL_RESOLUTIONS,
            allowed_aspect_ratios=ALL_ASPECT_RATIOS,
            storage_days_display=None,
        ),
    ),
    ACCESS_TIER_NONE: TierEntitlement(
        capabilities=frozenset({CAPABILITY_DOWNLOAD_VIDEO}),
        limits=CapabilityLimits(
            short_fixed_duration_seconds=None,
            short_duration_editable=False,
            allowed_resolutions=ALL_RESOLUTIONS,
            allowed_aspect_ratios=ALL_ASPECT_RATIOS,
            storage_days_display=None,
        ),
    ),
}

