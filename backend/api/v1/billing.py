"""
套餐与配额路由
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.billing import (
    ChargeReconciliationOut,
    CapabilityLimitsOut,
    CheckoutSessionOut,
    CreateQuotaPackageCheckoutRequest,
    CreateSubscriptionCheckoutRequest,
    CustomerPortalOut,
    QuotaPackagePlanOut,
    QuotaSnapshotOut,
    SubscriptionPlanOut,
    TaskChargeReconciliationItemOut,
)
from backend.services.billing_service import (
    create_portal_link,
    create_quota_package_checkout,
    create_subscription_checkout,
    process_webhook_payload,
)
from backend.services.entitlement_service import build_user_access_context
from backend.services.quota_service import (
    get_task_charge_reconciliation,
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
        subscription_status=context.subscription_status,
        subscription_cancel_at_period_end=context.subscription_cancel_at_period_end,
        subscription_current_period_end=context.subscription_current_period_end,
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


@router.get("/reconciliation", response_model=ChargeReconciliationOut)
async def get_charge_reconciliation(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChargeReconciliationOut:
    result = await get_task_charge_reconciliation(db, user.id, limit=limit)
    return ChargeReconciliationOut(
        total_tasks=result["total_tasks"],
        planned_total=result["planned_total"],
        charged_total=result["charged_total"],
        successful_short_tasks=result["successful_short_tasks"],
        successful_long_tasks=result["successful_long_tasks"],
        successful_long_segments=result["successful_long_segments"],
        pending_reserved_total=result["pending_reserved_total"],
        items=[
            TaskChargeReconciliationItemOut(
                task_id=task.id,
                task_type=task.task_type,
                status=task.status,
                planned_quota_consumed=task.planned_quota_consumed,
                charged_quota_consumed=task.charged_quota_consumed,
                charge_status=task.charge_status,
                charged_at=task.charged_at,
                created_at=task.created_at,
                finished_at=task.finished_at,
            )
            for task in result["items"]
        ],
    )


@router.post("/checkout/subscription", response_model=CheckoutSessionOut)
async def create_subscription_checkout_session(
    body: CreateSubscriptionCheckoutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutSessionOut:
    try:
        checkout_url = await create_subscription_checkout(db, user, body.plan_id)
        await db.commit()
        return CheckoutSessionOut(checkout_url=checkout_url)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/checkout/quota-package", response_model=CheckoutSessionOut)
async def create_quota_package_checkout_session(
    body: CreateQuotaPackageCheckoutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutSessionOut:
    try:
        checkout_url = await create_quota_package_checkout(db, user, body.package_plan_id)
        await db.commit()
        return CheckoutSessionOut(checkout_url=checkout_url)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/customer-portal", response_model=CustomerPortalOut)
async def create_billing_customer_portal(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerPortalOut:
    try:
        portal_url = await create_portal_link(db, user)
        await db.commit()
        return CustomerPortalOut(portal_url=portal_url)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/webhooks/stripe")
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    payload = await request.body()
    try:
        result = await process_webhook_payload(db, payload, stripe_signature)
        await db.commit()
        return {"status": result}
    except AppError as exc:
        await db.commit()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except Exception:
        await db.commit()
        raise
