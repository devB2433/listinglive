"""
Stripe 客户端封装
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.models.user import User

PORTAL_CONFIGURATION_METADATA = {
    "managed_by": "listinglive",
    "purpose": "subscription_upgrade",
}
ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


def _get_stripe_client() -> stripe:
    if not settings.STRIPE_SECRET_KEY:
        raise AppError("billing.stripe.notConfigured", status_code=503)

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


async def get_or_create_customer_id(db: AsyncSession, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    client = _get_stripe_client()
    params: dict = {
        "name": user.username,
        "metadata": {"user_id": str(user.id)},
    }
    if user.email and "@" in user.email and not user.email.endswith("@localhost"):
        params["email"] = user.email
    customer = client.Customer.create(**params)
    user.stripe_customer_id = customer["id"]
    await db.flush()
    return customer["id"]


def _build_managed_portal_configuration_params() -> dict[str, Any]:
    client = _get_stripe_client()
    recurring_prices = client.Price.list(active=True, type="recurring", limit=100)
    products: dict[str, list[str]] = {}
    for price in recurring_prices.get("data", []):
        if isinstance(price, dict):
            raw_product = price.get("product")
            product_id = raw_product.get("id") if isinstance(raw_product, dict) else raw_product
            price_id = price.get("id")
        else:
            raw_product = getattr(price, "product", None)
            product_id = getattr(raw_product, "id", None) if raw_product is not None else None
            price_id = getattr(price, "id", None)
        if not product_id or not price_id:
            continue
        products.setdefault(str(product_id), []).append(str(price_id))

    if not products:
        raise AppError("billing.plan.notConfigured", status_code=400)

    return {
        "name": "ListingLive Managed Portal",
        "default_return_url": settings.STRIPE_BILLING_PORTAL_RETURN_URL,
        "features": {
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "subscription_cancel": {
                "enabled": True,
                "mode": "at_period_end",
                "proration_behavior": "none",
                "cancellation_reason": {
                    "enabled": True,
                    "options": ["too_expensive", "switched_service", "unused", "other"],
                },
            },
            "subscription_update": {
                "enabled": True,
                "default_allowed_updates": ["price"],
                # Upgrades take effect immediately and start a new billing cycle from now.
                "proration_behavior": "none",
                "billing_cycle_anchor": "now",
                "products": [
                    {"product": product_id, "prices": sorted(price_ids)}
                    for product_id, price_ids in sorted(products.items())
                ],
            },
        },
        "metadata": PORTAL_CONFIGURATION_METADATA,
    }


def ensure_billing_portal_configuration() -> str:
    client = _get_stripe_client()
    configured_id = settings.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
    params = _build_managed_portal_configuration_params()

    if configured_id:
        config = client.billing_portal.Configuration.modify(configured_id, **params)
        return str(config["id"])

    configs = client.billing_portal.Configuration.list(limit=20)
    for config in configs.get("data", []):
        metadata = config.get("metadata") if isinstance(config, dict) else getattr(config, "metadata", {})
        if metadata == PORTAL_CONFIGURATION_METADATA:
            config_id = config.get("id") if isinstance(config, dict) else getattr(config, "id", None)
            if not config_id:
                continue
            updated = client.billing_portal.Configuration.modify(str(config_id), **params)
            return str(updated["id"])

    created = client.billing_portal.Configuration.create(**params)
    return str(created["id"])


def create_subscription_checkout_session(
    *,
    customer_id: str,
    price_id: str,
    user_id: str,
    plan_id: str,
    plan_type: str,
    effective_strategy: str = "immediate",
    trial_end_at: datetime | None = None,
) -> str:
    client = _get_stripe_client()
    subscription_metadata = {
        "user_id": user_id,
        "plan_id": plan_id,
        "plan_type": plan_type,
        "effective_strategy": effective_strategy,
    }
    subscription_data: dict[str, Any] = {"metadata": subscription_metadata}
    if trial_end_at is not None:
        subscription_data["trial_end"] = int(trial_end_at.timestamp())

    session = client.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=user_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=settings.STRIPE_CHECKOUT_SUCCESS_URL,
        cancel_url=settings.STRIPE_CHECKOUT_CANCEL_URL,
        allow_promotion_codes=True,
        metadata={
            "billing_kind": "subscription",
            "user_id": user_id,
            "plan_id": plan_id,
            "plan_type": plan_type,
            "effective_strategy": effective_strategy,
        },
        subscription_data=subscription_data,
    )
    url = session.get("url") if isinstance(session, dict) else getattr(session, "url", None)
    if not url:
        raise AppError("billing.stripe.checkoutUrlMissing", status_code=502)
    return str(url)


def create_quota_package_checkout_session(
    *,
    customer_id: str,
    price_id: str,
    user_id: str,
    package_plan_id: str,
    package_type: str,
) -> str:
    client = _get_stripe_client()
    session = client.checkout.Session.create(
        mode="payment",
        customer=customer_id,
        client_reference_id=user_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=settings.STRIPE_CHECKOUT_SUCCESS_URL,
        cancel_url=settings.STRIPE_CHECKOUT_CANCEL_URL,
        allow_promotion_codes=True,
        metadata={
            "billing_kind": "quota_package",
            "user_id": user_id,
            "package_plan_id": package_plan_id,
            "package_type": package_type,
        },
    )
    url = session.get("url") if isinstance(session, dict) else getattr(session, "url", None)
    if not url:
        raise AppError("billing.stripe.checkoutUrlMissing", status_code=502)
    return str(url)


def create_customer_portal_session(*, customer_id: str) -> str:
    client = _get_stripe_client()
    configuration_id = ensure_billing_portal_configuration()
    session = client.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL,
        configuration=configuration_id,
    )
    url = session.get("url") if isinstance(session, dict) else getattr(session, "url", None)
    if not url:
        raise AppError("billing.stripe.checkoutUrlMissing", status_code=502)
    return str(url)


def create_subscription_update_confirm_session(
    *,
    customer_id: str,
    subscription_id: str,
    new_price_id: str,
) -> str:
    client = _get_stripe_client()
    configuration_id = ensure_billing_portal_configuration()
    subscription = client.Subscription.retrieve(subscription_id)
    items = subscription["items"]["data"]
    if not items:
        raise AppError("billing.stripe.subscriptionPayloadInvalid", status_code=400)
    item_id = items[0]["id"]
    session = client.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL,
        configuration=configuration_id,
        flow_data={
            "type": "subscription_update_confirm",
            "after_completion": {
                "type": "redirect",
                "redirect": {"return_url": settings.STRIPE_BILLING_PORTAL_RETURN_URL},
            },
            "subscription_update_confirm": {
                "subscription": subscription_id,
                "items": [{"id": item_id, "price": new_price_id, "quantity": 1}],
            },
        },
    )
    url = session.get("url") if isinstance(session, dict) else getattr(session, "url", None)
    if not url:
        raise AppError("billing.stripe.checkoutUrlMissing", status_code=502)
    return str(url)


def construct_webhook_event(payload: bytes, signature: str | None) -> Any:
    client = _get_stripe_client()
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise AppError("billing.stripe.webhookNotConfigured", status_code=503)
    if not signature:
        raise AppError("billing.stripe.missingSignature", status_code=400)

    try:
        return client.Webhook.construct_event(payload=payload, sig_header=signature, secret=settings.STRIPE_WEBHOOK_SECRET)
    except ValueError as exc:
        raise AppError("billing.stripe.invalidPayload", status_code=400) from exc
    except stripe.error.SignatureVerificationError as exc:
        raise AppError("billing.stripe.invalidSignature", status_code=400) from exc


def retrieve_subscription(subscription_id: str) -> Any:
    client = _get_stripe_client()
    return client.Subscription.retrieve(subscription_id)


def list_active_customer_subscriptions(customer_id: str) -> list[Any]:
    client = _get_stripe_client()
    subscriptions = client.Subscription.list(customer=customer_id, status="all", limit=100)
    data = subscriptions.get("data", []) if isinstance(subscriptions, dict) else getattr(subscriptions, "data", [])
    active: list[Any] = []
    for subscription in data:
        if isinstance(subscription, dict):
            status = str(subscription.get("status") or "")
        else:
            status = str(getattr(subscription, "status", "") or "")
        if status in ACTIVE_STRIPE_SUBSCRIPTION_STATUSES:
            active.append(subscription)
    return active


def preview_subscription_price_change(*, customer_id: str, subscription_id: str, new_price_id: str) -> Any:
    client = _get_stripe_client()
    subscription = client.Subscription.retrieve(subscription_id)
    items = subscription["items"]["data"]
    if not items:
        raise AppError("billing.stripe.subscriptionPayloadInvalid", status_code=400)
    item_id = items[0]["id"]
    proration_date = int(datetime.now(timezone.utc).timestamp())
    return client.Invoice.create_preview(
        customer=customer_id,
        subscription=subscription_id,
        subscription_details={
            "proration_date": proration_date,
            "items": [{"id": item_id, "price": new_price_id}],
        },
    )


def modify_subscription_price(*, subscription_id: str, new_price_id: str) -> Any:
    """Create a prorated upgrade that only applies after payment succeeds."""
    client = _get_stripe_client()
    subscription = client.Subscription.retrieve(subscription_id)
    items = subscription["items"]["data"]
    if not items:
        raise AppError("billing.stripe.subscriptionPayloadInvalid", status_code=400)
    item_id = items[0]["id"]
    updated = client.Subscription.modify(
        subscription_id,
        items=[{"id": item_id, "price": new_price_id}],
        proration_behavior="always_invoice",
        payment_behavior="pending_if_incomplete",
        expand=["latest_invoice.payment_intent"],
    )
    return updated
