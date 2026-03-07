"""
Stripe 客户端封装
"""
from __future__ import annotations

from typing import Any

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.models.user import User


def _get_stripe_client() -> stripe:
    if not settings.STRIPE_SECRET_KEY:
        raise AppError("billing.stripe.notConfigured", status_code=503)

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


async def get_or_create_customer_id(db: AsyncSession, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    client = _get_stripe_client()
    customer = client.Customer.create(
        email=user.email,
        name=user.username,
        metadata={"user_id": str(user.id)},
    )
    user.stripe_customer_id = customer["id"]
    await db.flush()
    return customer["id"]


def create_subscription_checkout_session(*, customer_id: str, price_id: str, user_id: str, plan_id: str, plan_type: str) -> str:
    client = _get_stripe_client()
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
        },
        subscription_data={
            "metadata": {
                "user_id": user_id,
                "plan_id": plan_id,
                "plan_type": plan_type,
            }
        },
    )
    return str(session["url"])


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
    return str(session["url"])


def create_customer_portal_session(*, customer_id: str) -> str:
    client = _get_stripe_client()
    session = client.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL,
    )
    return str(session["url"])


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
