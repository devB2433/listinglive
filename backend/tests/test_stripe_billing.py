import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import stripe

from backend.api.v1.billing import _classify_stripe_billing_error
from backend.services.stripe_service import _build_managed_portal_configuration_params


class StripeBillingTests(unittest.TestCase):
    def test_build_managed_portal_configuration_groups_recurring_prices_by_product(self) -> None:
        price_list = {
            "data": [
                {"id": "price_basic", "product": "prod_listing"},
                {"id": "price_ultimate", "product": "prod_listing"},
                {"id": "price_addon", "product": "prod_addon"},
            ]
        }
        fake_client = SimpleNamespace(Price=SimpleNamespace(list=Mock(return_value=price_list)))

        with patch("backend.services.stripe_service._get_stripe_client", return_value=fake_client):
            params = _build_managed_portal_configuration_params()

        self.assertEqual(params["features"]["subscription_update"]["default_allowed_updates"], ["price"])
        self.assertEqual(params["features"]["subscription_update"]["proration_behavior"], "none")
        self.assertEqual(params["features"]["subscription_update"]["billing_cycle_anchor"], "now")
        self.assertEqual(
            params["features"]["subscription_update"]["products"],
            [
                {"product": "prod_addon", "prices": ["price_addon"]},
                {"product": "prod_listing", "prices": ["price_basic", "price_ultimate"]},
            ],
        )

    def test_classify_stripe_billing_error_for_disabled_portal_upgrade(self) -> None:
        exc = stripe.error.InvalidRequestError(
            message="This subscription cannot be updated because the subscription update feature in the portal configuration is disabled.",
            param=None,
        )

        self.assertEqual(_classify_stripe_billing_error(exc), "billing.subscription.upgradeUnavailable")

    def test_classify_stripe_billing_error_for_no_changes_to_confirm(self) -> None:
        exc = stripe.error.InvalidRequestError(
            message="Cannot update the subscription because there are no changes to confirm.",
            param=None,
        )

        self.assertEqual(_classify_stripe_billing_error(exc), "billing.subscription.noChangesToConfirm")


if __name__ == "__main__":
    unittest.main()
