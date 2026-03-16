"""
套餐/配额 schema
"""
from datetime import datetime
from decimal import Decimal
from typing import Literal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class SubscriptionPlanOut(BaseModel):
    id: UUID
    plan_type: str
    name: str
    quota_per_month: int
    price_cad: Decimal
    storage_days: int
    stripe_price_id: str | None = None

    class Config:
        from_attributes = True


class QuotaPackagePlanOut(BaseModel):
    id: UUID
    package_type: str
    name: str
    quota_amount: int
    price_cad: Decimal
    validity_days: Optional[int]
    stripe_price_id: str | None = None

    class Config:
        from_attributes = True


class CapabilityLimitsOut(BaseModel):
    short_fixed_duration_seconds: Optional[int]
    short_duration_editable: bool
    allowed_resolutions: list[str]
    allowed_aspect_ratios: list[str]
    storage_days_display: Optional[int]


class QuotaSnapshotOut(BaseModel):
    subscription_plan_type: Optional[str]
    subscription_status: Optional[str] = None
    subscription_is_local_trial: bool = False
    subscription_is_billing_managed: bool = False
    subscription_cancel_at_period_end: bool = False
    trial_expires_at: Optional[datetime] = None
    subscription_current_period_start: Optional[datetime] = None
    subscription_current_period_end: Optional[datetime] = None
    subscription_remaining: int
    package_remaining: int
    paid_package_remaining: int
    signup_bonus_remaining: int
    invite_bonus_remaining: int
    total_available: int
    pending_reserved: int
    schedulable_available: int
    access_tier: str
    capabilities: list[str]
    can_purchase_quota_package: bool
    limits: CapabilityLimitsOut


class CreateSubscriptionCheckoutRequest(BaseModel):
    plan_id: UUID
    effective_strategy: Optional[Literal["immediate", "deferred"]] = None


class CreateQuotaPackageCheckoutRequest(BaseModel):
    package_plan_id: UUID


class CheckoutSessionOut(BaseModel):
    checkout_url: str


class CustomerPortalOut(BaseModel):
    portal_url: str


class UpgradeSubscriptionRequest(BaseModel):
    plan_id: UUID
    effective_strategy: Optional[Literal["immediate", "deferred"]] = None


class UpgradeSubscriptionPreviewOut(BaseModel):
    current_plan_type: str
    current_plan_name: str
    target_plan_type: str
    target_plan_name: str
    amount_due_cents: int
    currency: str
    current_period_end: Optional[datetime] = None


class UpgradeSubscriptionOut(BaseModel):
    result_status: str
    effective_strategy: Optional[str] = None
    invoice_hosted_url: Optional[str] = None
    message: Optional[str] = None
    plan_type: Optional[str] = None
    quota_per_month: Optional[int] = None
    quota_used: Optional[int] = None
    storage_days: Optional[int] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True


class TaskChargeReconciliationItemOut(BaseModel):
    task_id: UUID
    task_type: str
    status: str
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    charged_at: Optional[datetime] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


class ChargeReconciliationOut(BaseModel):
    total_tasks: int
    planned_total: int
    charged_total: int
    successful_short_tasks: int
    successful_long_tasks: int
    successful_long_segments: int
    pending_reserved_total: int
    items: list[TaskChargeReconciliationItemOut]
