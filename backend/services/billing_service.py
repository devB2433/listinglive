"""
Stripe 计费同步服务
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.entitlements import PLAN_TIER_ORDER
from backend.core.config import settings
from backend.models.quota import QuotaPackage, QuotaPackagePlan
from backend.models.stripe_webhook_event import StripeWebhookEvent
from backend.models.subscription import Subscription, SubscriptionPlan
from backend.models.user import User
from backend.services.entitlement_service import build_user_access_context
from backend.services.stripe_service import (
    construct_webhook_event,
    create_customer_portal_session,
    create_quota_package_checkout_session,
    create_subscription_checkout_session,
    create_subscription_update_confirm_session,
    get_or_create_customer_id,
    preview_subscription_price_change,
    retrieve_subscription,
)

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


def _as_datetime(timestamp: int | None) -> datetime | None:
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def _to_event_payload(event: Any) -> dict | list | None:
    if hasattr(event, "to_dict_recursive"):
        return event.to_dict_recursive()
    if isinstance(event, (dict, list)):
        return event
    return None


def compute_subscription_quota_used(
    existing_subscription: Subscription | None,
    *,
    plan_quota_per_month: int,
    period_start: datetime | None,
    period_end: datetime | None,
) -> int:
    if existing_subscription is None:
        return 0

    same_cycle = (
        existing_subscription.current_period_start == period_start
        and existing_subscription.current_period_end == period_end
    )
    if not same_cycle:
        return 0
    return min(existing_subscription.quota_used, plan_quota_per_month)


def _extract_id(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        raw = value.get("id")
        return str(raw) if raw else None
    raw = getattr(value, "id", None)
    return str(raw) if raw else None


def _extract_subscription_price_id(subscription: Any) -> str | None:
    items = subscription.get("items", {}) if isinstance(subscription, dict) else subscription["items"]
    data = items.get("data", []) if isinstance(items, dict) else items["data"]
    if not data:
        return None
    first_item = data[0]
    price = first_item.get("price") if isinstance(first_item, dict) else first_item["price"]
    return _extract_id(price)


def _extract_metadata(payload: Any) -> dict[str, str]:
    if isinstance(payload, dict):
        metadata = payload.get("metadata")
    else:
        metadata = getattr(payload, "metadata", None)
    if not isinstance(metadata, dict):
        return {}
    return {str(key): str(value) for key, value in metadata.items()}


async def _get_user_by_stripe_customer_id(db: AsyncSession, stripe_customer_id: str) -> User | None:
    stmt = select(User).where(User.stripe_customer_id == stripe_customer_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_user_for_stripe_object(db: AsyncSession, payload: Any) -> User:
    customer_id = _extract_id(payload.get("customer") if isinstance(payload, dict) else getattr(payload, "customer", None))
    metadata = _extract_metadata(payload)

    user: User | None = None
    if customer_id:
        user = await _get_user_by_stripe_customer_id(db, customer_id)

    if user is None and metadata.get("user_id"):
        try:
            user_id = UUID(metadata["user_id"])
        except ValueError as exc:
            raise AppError("billing.stripe.invalidUserMetadata", status_code=400) from exc
        user = await db.get(User, user_id)

    if user is None:
        raise AppError("billing.stripe.userNotFound", status_code=404)

    if customer_id and not user.stripe_customer_id:
        user.stripe_customer_id = customer_id
        await db.flush()
    return user


async def _get_plan_by_id(db: AsyncSession, plan_id: UUID) -> SubscriptionPlan | None:
    stmt = select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id, SubscriptionPlan.is_active.is_(True))
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_quota_package_plan_by_id(db: AsyncSession, plan_id: UUID) -> QuotaPackagePlan | None:
    stmt = select(QuotaPackagePlan).where(QuotaPackagePlan.id == plan_id, QuotaPackagePlan.is_active.is_(True))
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_plan_by_stripe_price_id(db: AsyncSession, stripe_price_id: str) -> SubscriptionPlan | None:
    stmt = select(SubscriptionPlan).where(SubscriptionPlan.stripe_price_id == stripe_price_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_quota_package_plan_by_stripe_price_id(db: AsyncSession, stripe_price_id: str) -> QuotaPackagePlan | None:
    stmt = select(QuotaPackagePlan).where(QuotaPackagePlan.stripe_price_id == stripe_price_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_subscription_checkout(db: AsyncSession, user: User, plan_id: UUID) -> str:
    plan = await _get_plan_by_id(db, plan_id)
    if plan is None:
        raise AppError("billing.plan.notFound", status_code=404)
    if not plan.stripe_price_id:
        raise AppError("billing.plan.notConfigured", status_code=400)

    context = await build_user_access_context(db, user.id)
    if context.subscription_plan_type == plan.plan_type:
        raise AppError("billing.subscription.alreadyActive", status_code=400)
    if context.subscription_plan_type is not None:
        raise AppError("billing.subscription.manageExisting", status_code=400)

    customer_id = await get_or_create_customer_id(db, user)
    return create_subscription_checkout_session(
        customer_id=customer_id,
        price_id=plan.stripe_price_id,
        user_id=str(user.id),
        plan_id=str(plan.id),
        plan_type=plan.plan_type,
    )


async def create_quota_package_checkout(db: AsyncSession, user: User, package_plan_id: UUID) -> str:
    plan = await _get_quota_package_plan_by_id(db, package_plan_id)
    if plan is None:
        raise AppError("billing.quotaPackage.notFound", status_code=404)
    if not plan.stripe_price_id:
        raise AppError("billing.quotaPackage.notConfigured", status_code=400)

    context = await build_user_access_context(db, user.id)
    if not context.can_purchase_quota_package:
        raise AppError("billing.quotaPackage.notAllowed", status_code=403)

    customer_id = await get_or_create_customer_id(db, user)
    return create_quota_package_checkout_session(
        customer_id=customer_id,
        price_id=plan.stripe_price_id,
        user_id=str(user.id),
        package_plan_id=str(plan.id),
        package_type=plan.package_type,
    )


async def create_portal_link(db: AsyncSession, user: User) -> str:
    customer_id = await get_or_create_customer_id(db, user)
    return create_customer_portal_session(customer_id=customer_id)


async def _get_validated_upgrade_target(
    db: AsyncSession,
    user: User,
    target_plan_id: UUID,
) -> tuple[Subscription, SubscriptionPlan]:
    from backend.services.quota_service import get_active_subscription

    subscription = await get_active_subscription(db, user.id)
    if subscription is None or not subscription.stripe_subscription_id:
        raise AppError("billing.subscription.noActiveSubscription", status_code=400)

    target_plan = await _get_plan_by_id(db, target_plan_id)
    if target_plan is None:
        raise AppError("billing.plan.notFound", status_code=404)
    if not target_plan.stripe_price_id:
        raise AppError("billing.plan.notConfigured", status_code=400)
    if subscription.plan_type == target_plan.plan_type:
        raise AppError("billing.subscription.alreadyActive", status_code=400)

    current_tier = PLAN_TIER_ORDER.get(subscription.plan_type, 0)
    target_tier = PLAN_TIER_ORDER.get(target_plan.plan_type, 0)
    if target_tier <= current_tier:
        raise AppError("billing.subscription.cannotDowngrade", status_code=400)
    return subscription, target_plan


def _extract_amount_due(invoice: Any) -> int:
    if isinstance(invoice, dict):
        raw = invoice.get("amount_due")
    else:
        raw = getattr(invoice, "amount_due", None)
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def _extract_currency(invoice: Any) -> str:
    if isinstance(invoice, dict):
        raw = invoice.get("currency")
    else:
        raw = getattr(invoice, "currency", None)
    return str(raw or "cad").lower()


def _extract_latest_invoice(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        invoice = payload.get("latest_invoice")
        return invoice if isinstance(invoice, dict) else None
    invoice = getattr(payload, "latest_invoice", None)
    if hasattr(invoice, "to_dict_recursive"):
        return invoice.to_dict_recursive()
    return invoice if isinstance(invoice, dict) else None


def _extract_payment_intent(invoice: dict[str, Any] | None) -> dict[str, Any] | None:
    if not invoice:
        return None
    payment_intent = invoice.get("payment_intent")
    return payment_intent if isinstance(payment_intent, dict) else None


async def preview_upgrade_subscription(db: AsyncSession, user: User, target_plan_id: UUID) -> dict[str, Any]:
    subscription, target_plan = await _get_validated_upgrade_target(db, user, target_plan_id)
    customer_id = await get_or_create_customer_id(db, user)
    preview = preview_subscription_price_change(
        customer_id=customer_id,
        subscription_id=subscription.stripe_subscription_id,
        new_price_id=target_plan.stripe_price_id,
    )
    return {
        "current_plan_type": subscription.plan_type,
        "current_plan_name": subscription.plan_type.title(),
        "target_plan_type": target_plan.plan_type,
        "target_plan_name": target_plan.name,
        "amount_due_cents": _extract_amount_due(preview),
        "currency": _extract_currency(preview),
        "current_period_end": subscription.current_period_end,
    }


async def upgrade_subscription(db: AsyncSession, user: User, target_plan_id: UUID) -> dict[str, Any]:
    subscription, target_plan = await _get_validated_upgrade_target(db, user, target_plan_id)
    customer_id = await get_or_create_customer_id(db, user)
    confirmation_url = create_subscription_update_confirm_session(
        customer_id=customer_id,
        subscription_id=subscription.stripe_subscription_id,
        new_price_id=target_plan.stripe_price_id,
    )
    return {
        "result_status": "redirect_to_stripe",
        "invoice_hosted_url": confirmation_url,
        "message": "subscription_update_confirm",
    }


async def _upsert_subscription_from_payload(db: AsyncSession, payload: Any, event_id: str) -> Subscription:
    user = await _resolve_user_for_stripe_object(db, payload)

    stripe_subscription_id = _extract_id(payload.get("id") if isinstance(payload, dict) else payload["id"])
    stripe_customer_id = _extract_id(payload.get("customer") if isinstance(payload, dict) else payload["customer"])
    stripe_price_id = _extract_subscription_price_id(payload)
    if not stripe_subscription_id or not stripe_price_id:
        raise AppError("billing.stripe.subscriptionPayloadInvalid", status_code=400)

    plan = await _get_plan_by_stripe_price_id(db, stripe_price_id)
    if plan is None:
        raise AppError("billing.plan.notConfigured", status_code=400)

    stmt = select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    subscription = (await db.execute(stmt)).scalar_one_or_none()

    period_start = _as_datetime(payload.get("current_period_start") if isinstance(payload, dict) else payload["current_period_start"])
    period_end = _as_datetime(payload.get("current_period_end") if isinstance(payload, dict) else payload["current_period_end"])
    quota_used = compute_subscription_quota_used(
        subscription,
        plan_quota_per_month=plan.quota_per_month,
        period_start=period_start,
        period_end=period_end,
    )

    latest_invoice_id = _extract_id(payload.get("latest_invoice") if isinstance(payload, dict) else payload["latest_invoice"])
    status = str(payload.get("status") if isinstance(payload, dict) else payload["status"])
    cancel_at_period_end = bool(
        payload.get("cancel_at_period_end") if isinstance(payload, dict) else payload["cancel_at_period_end"]
    )
    canceled_at = _as_datetime(payload.get("canceled_at") if isinstance(payload, dict) else payload["canceled_at"])

    if subscription is None:
        subscription = Subscription(user_id=user.id)
        db.add(subscription)

    subscription.subscription_plan_id = plan.id
    subscription.plan_type = plan.plan_type
    subscription.status = status
    subscription.quota_per_month = plan.quota_per_month
    subscription.quota_used = quota_used
    subscription.storage_days = plan.storage_days
    subscription.stripe_subscription_id = stripe_subscription_id
    subscription.stripe_customer_id = stripe_customer_id
    subscription.stripe_price_id = stripe_price_id
    subscription.cancel_at_period_end = cancel_at_period_end
    subscription.canceled_at = canceled_at
    subscription.latest_invoice_id = latest_invoice_id
    subscription.last_stripe_event_id = event_id
    subscription.current_period_start = period_start
    subscription.current_period_end = period_end
    await db.flush()
    return subscription


async def _grant_quota_package_from_checkout_session(db: AsyncSession, payload: Any, event_id: str) -> QuotaPackage:
    user = await _resolve_user_for_stripe_object(db, payload)
    metadata = _extract_metadata(payload)
    stripe_session_id = _extract_id(payload.get("id") if isinstance(payload, dict) else payload["id"])
    payment_intent_id = _extract_id(payload.get("payment_intent") if isinstance(payload, dict) else payload["payment_intent"])
    stripe_price_id = metadata.get("stripe_price_id")

    package_plan: QuotaPackagePlan | None = None
    if metadata.get("package_plan_id"):
        try:
            package_plan = await _get_quota_package_plan_by_id(db, UUID(metadata["package_plan_id"]))
        except ValueError as exc:
            raise AppError("billing.quotaPackage.invalidMetadata", status_code=400) from exc
    if package_plan is None and stripe_price_id:
        package_plan = await _get_quota_package_plan_by_stripe_price_id(db, stripe_price_id)
    if package_plan is None and metadata.get("package_type"):
        stmt = select(QuotaPackagePlan).where(QuotaPackagePlan.package_type == metadata["package_type"])
        package_plan = (await db.execute(stmt)).scalar_one_or_none()
    if package_plan is None:
        raise AppError("billing.quotaPackage.notConfigured", status_code=400)

    stmt = select(QuotaPackage).where(QuotaPackage.stripe_checkout_session_id == stripe_session_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is None and payment_intent_id:
        existing = (
            await db.execute(select(QuotaPackage).where(QuotaPackage.stripe_payment_intent_id == payment_intent_id))
        ).scalar_one_or_none()
    if existing is not None:
        existing.payment_status = "paid"
        existing.last_stripe_event_id = event_id
        await db.flush()
        return existing

    package = QuotaPackage(
        user_id=user.id,
        quota_package_plan_id=package_plan.id,
        package_type=package_plan.package_type,
        quota_total=package_plan.quota_amount,
        quota_used=0,
        expires_at=None,
        stripe_checkout_session_id=stripe_session_id,
        stripe_payment_intent_id=payment_intent_id,
        stripe_price_id=package_plan.stripe_price_id,
        payment_status="paid",
        last_stripe_event_id=event_id,
    )
    db.add(package)
    await db.flush()
    return package


async def _sync_subscription_by_id(db: AsyncSession, subscription_id: str, event_id: str) -> Subscription:
    payload = retrieve_subscription(subscription_id)
    return await _upsert_subscription_from_payload(db, payload, event_id)


async def _handle_checkout_completed(db: AsyncSession, payload: Any, event_id: str) -> None:
    metadata = _extract_metadata(payload)
    mode = payload.get("mode") if isinstance(payload, dict) else payload["mode"]
    if mode == "payment" and metadata.get("billing_kind") == "quota_package":
        await _grant_quota_package_from_checkout_session(db, payload, event_id)
        return
    if mode == "subscription":
        subscription_id = _extract_id(payload.get("subscription") if isinstance(payload, dict) else payload["subscription"])
        if subscription_id:
            await _sync_subscription_by_id(db, subscription_id, event_id)


async def _handle_subscription_event(db: AsyncSession, payload: Any, event_id: str) -> None:
    await _upsert_subscription_from_payload(db, payload, event_id)


async def _handle_invoice_event(db: AsyncSession, payload: Any, event_id: str) -> None:
    subscription_id = _extract_id(payload.get("subscription") if isinstance(payload, dict) else payload["subscription"])
    if not subscription_id:
        return
    await _sync_subscription_by_id(db, subscription_id, event_id)


async def process_webhook_payload(db: AsyncSession, payload: bytes, signature: str | None) -> str:
    event = construct_webhook_event(payload, signature)
    event_id = str(event["id"])
    event_type = str(event["type"])
    event_object = event["data"]["object"]
    object_id = _extract_id(event_object.get("id") if isinstance(event_object, dict) else event_object["id"])

    existing = (
        await db.execute(select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event_id))
    ).scalar_one_or_none()
    if existing is not None and existing.processed:
        return "duplicate"

    record = existing
    if record is None:
        record = StripeWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            object_id=object_id,
            processed=False,
            payload_json=_to_event_payload(event),
        )
        db.add(record)
    else:
        record.event_type = event_type
        record.object_id = object_id
        record.payload_json = _to_event_payload(event)
        record.error_message = None
    await db.flush()

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(db, event_object, event_id)
        elif event_type in {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "customer.subscription.pending_update_applied",
            "customer.subscription.pending_update_expired",
        }:
            await _handle_subscription_event(db, event_object, event_id)
        elif event_type in {"invoice.paid", "invoice.payment_failed"}:
            await _handle_invoice_event(db, event_object, event_id)

        record.processed = True
        record.processed_at = datetime.now(timezone.utc)
        record.error_message = None
        await db.flush()
        return "processed"
    except Exception as exc:
        record.processed = False
        record.error_message = str(exc)
        await db.flush()
        raise
