"""
把 Stripe Price ID 回填到本地 subscription_plans / quota_package_plans。

用法：
    python scripts/billing/sync_stripe_price_ids.py
    python scripts/billing/sync_stripe_price_ids.py --dry-run
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.core.config import settings
from backend.models.quota import QuotaPackagePlan
from backend.models.subscription import SubscriptionPlan

REPO_CONFIG_PATH = PROJECT_ROOT / "config" / "stripe_price_ids.local.json"
PROD_HOST_CONFIG_PATH = Path("/opt/listinglive/config/stripe_price_ids.local.json")
CONTAINER_CONFIG_PATH = Path("/run/listinglive/config/stripe_price_ids.local.json")
APP_CONFIG_PATH = Path("/opt/listinglive/app/config/stripe_price_ids.local.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Stripe price IDs into local billing plan tables.")
    parser.add_argument(
        "--config",
        help=(
            "Path to the JSON file containing Stripe price mappings. "
            "If omitted, auto-detects: /run/listinglive/config -> /opt/listinglive/config -> repo config/."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and print changes without updating the database.")
    return parser.parse_args()


def resolve_mapping_path(config_arg: str | None) -> Path:
    if config_arg:
        path = Path(config_arg)
    else:
        if CONTAINER_CONFIG_PATH.exists():
            path = CONTAINER_CONFIG_PATH
        elif PROD_HOST_CONFIG_PATH.exists():
            path = PROD_HOST_CONFIG_PATH
        else:
            path = REPO_CONFIG_PATH

    resolved = path.resolve()
    if resolved == APP_CONFIG_PATH and (CONTAINER_CONFIG_PATH.exists() or PROD_HOST_CONFIG_PATH.exists()):
        raise ValueError(
            "Refusing to use /opt/listinglive/app/config/stripe_price_ids.local.json in production flow. "
            "Use /run/listinglive/config/stripe_price_ids.local.json (container) "
            "or /opt/listinglive/config/stripe_price_ids.local.json (host)."
        )
    return path


def load_mapping(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Mapping file not found: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Mapping file root must be an object.")
    if not isinstance(payload.get("subscriptions"), dict):
        raise ValueError("Mapping file must contain a 'subscriptions' object.")
    if not isinstance(payload.get("quota_packages"), dict):
        raise ValueError("Mapping file must contain a 'quota_packages' object.")
    return payload


def sync_subscription_prices(session: Session, mapping: dict[str, str], dry_run: bool) -> int:
    updated = 0
    existing = {
        plan.plan_type: plan
        for plan in session.execute(select(SubscriptionPlan)).scalars().all()
    }

    for plan_type, price_id in mapping.items():
        plan = existing.get(plan_type)
        if plan is None:
            raise ValueError(f"Unknown subscription plan_type: {plan_type}")
        if not isinstance(price_id, str) or not price_id.strip():
            raise ValueError(f"Invalid Stripe price ID for subscription '{plan_type}'")

        if plan.stripe_price_id == price_id:
            continue

        print(f"[subscription] {plan_type}: {plan.stripe_price_id!r} -> {price_id!r}")
        updated += 1
        if not dry_run:
            plan.stripe_price_id = price_id

    return updated


def sync_quota_package_prices(session: Session, mapping: dict[str, str], dry_run: bool) -> int:
    updated = 0
    existing = {
        plan.package_type: plan
        for plan in session.execute(select(QuotaPackagePlan)).scalars().all()
    }

    for package_type, price_id in mapping.items():
        plan = existing.get(package_type)
        if plan is None:
            raise ValueError(f"Unknown quota package_type: {package_type}")
        if not isinstance(price_id, str) or not price_id.strip():
            raise ValueError(f"Invalid Stripe price ID for quota package '{package_type}'")

        if plan.stripe_price_id == price_id:
            continue

        print(f"[quota_package] {package_type}: {plan.stripe_price_id!r} -> {price_id!r}")
        updated += 1
        if not dry_run:
            plan.stripe_price_id = price_id

    return updated


def main() -> None:
    args = parse_args()
    mapping_path = resolve_mapping_path(args.config)
    print(f"Using mapping file: {mapping_path}")
    payload = load_mapping(mapping_path)

    engine = create_engine(settings.SYNC_DATABASE_URL, future=True)
    with Session(engine) as session:
        subscription_updates = sync_subscription_prices(session, payload["subscriptions"], args.dry_run)
        quota_package_updates = sync_quota_package_prices(session, payload["quota_packages"], args.dry_run)

        if args.dry_run:
            session.rollback()
        else:
            session.commit()

    total = subscription_updates + quota_package_updates
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"{mode}: {total} updates ({subscription_updates} subscriptions, {quota_package_updates} quota packages)")


if __name__ == "__main__":
    main()
