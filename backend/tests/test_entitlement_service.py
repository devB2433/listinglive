import unittest
from types import SimpleNamespace

from backend.services.entitlement_service import build_access_context_from_snapshot, has_capability


class EntitlementServiceTests(unittest.TestCase):
    def test_signup_bonus_matches_basic_feature_access(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": None,
                "subscription_remaining": 0,
                "package_remaining": 5,
                "paid_package_remaining": 0,
                "signup_bonus_remaining": 5,
                "invite_bonus_remaining": 0,
                "total_available": 5,
            }
        )

        self.assertEqual(context.access_tier, "signup_bonus")
        self.assertTrue(has_capability(context, "short_video_create"))
        self.assertTrue(context.can_purchase_quota_package)
        self.assertEqual(context.limits.short_fixed_duration_seconds, 4)
        self.assertFalse(context.limits.short_duration_editable)
        self.assertFalse(has_capability(context, "merge_per_image_template"))
        self.assertFalse(has_capability(context, "transition_effect"))
        self.assertFalse(has_capability(context, "logo_position_customize"))
        self.assertEqual(context.limits.allowed_resolutions, ("1080p",))

    def test_basic_subscription_keeps_fixed_short_duration(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": SimpleNamespace(plan_type="basic", storage_days=15),
                "subscription_remaining": 20,
                "package_remaining": 0,
                "paid_package_remaining": 0,
                "signup_bonus_remaining": 0,
                "invite_bonus_remaining": 0,
                "total_available": 20,
            }
        )

        self.assertEqual(context.access_tier, "basic")
        self.assertEqual(context.limits.short_fixed_duration_seconds, 4)
        self.assertFalse(context.limits.short_duration_editable)
        self.assertTrue(context.can_purchase_quota_package)
        self.assertFalse(has_capability(context, "merge_per_image_template"))
        self.assertFalse(has_capability(context, "transition_effect"))
        self.assertEqual(context.limits.allowed_resolutions, ("1080p",))

    def test_pro_subscription_unlocks_advanced_capabilities(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": SimpleNamespace(plan_type="pro", storage_days=30),
                "subscription_remaining": 50,
                "package_remaining": 10,
                "paid_package_remaining": 10,
                "signup_bonus_remaining": 0,
                "invite_bonus_remaining": 0,
                "total_available": 60,
            }
        )

        self.assertEqual(context.access_tier, "pro")
        self.assertTrue(has_capability(context, "merge_per_image_template"))
        self.assertTrue(has_capability(context, "merge_per_segment_duration"))
        self.assertTrue(has_capability(context, "merge_drag_reorder"))
        self.assertTrue(has_capability(context, "transition_effect"))
        self.assertTrue(has_capability(context, "logo_position_customize"))
        self.assertTrue(context.can_purchase_quota_package)
        self.assertTrue(context.limits.short_duration_editable)
        self.assertEqual(context.limits.allowed_resolutions, ("1080p",))

    def test_no_subscription_after_bonus_used_is_not_signup_state(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": None,
                "subscription_remaining": 0,
                "package_remaining": 0,
                "paid_package_remaining": 0,
                "signup_bonus_remaining": 0,
                "invite_bonus_remaining": 0,
                "total_available": 0,
            }
        )

        self.assertEqual(context.access_tier, "none")
        self.assertFalse(has_capability(context, "short_video_create"))
        self.assertFalse(context.can_purchase_quota_package)

    def test_paid_package_does_not_upgrade_basic_permissions(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": SimpleNamespace(plan_type="basic", storage_days=15),
                "subscription_remaining": 3,
                "package_remaining": 13,
                "paid_package_remaining": 10,
                "signup_bonus_remaining": 3,
                "invite_bonus_remaining": 0,
                "total_available": 16,
            }
        )

        self.assertEqual(context.access_tier, "basic")
        self.assertEqual(context.paid_package_remaining, 10)
        self.assertFalse(has_capability(context, "merge_per_image_template"))
        self.assertFalse(context.limits.short_duration_editable)

    def test_invite_bonus_keeps_basic_access_available(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": None,
                "subscription_remaining": 0,
                "package_remaining": 15,
                "paid_package_remaining": 0,
                "signup_bonus_remaining": 0,
                "invite_bonus_remaining": 15,
                "total_available": 15,
            }
        )

        self.assertEqual(context.access_tier, "signup_bonus")
        self.assertEqual(context.invite_bonus_remaining, 15)
        self.assertTrue(has_capability(context, "short_video_create"))
        self.assertFalse(has_capability(context, "merge_per_image_template"))
        self.assertFalse(context.limits.short_duration_editable)

    def test_expired_local_trial_without_formal_subscription_returns_free_signup_bonus_state(self) -> None:
        context = build_access_context_from_snapshot(
            {
                "subscription": None,
                "subscription_remaining": 0,
                "package_remaining": 20,
                "paid_package_remaining": 0,
                "signup_bonus_remaining": 5,
                "invite_bonus_remaining": 15,
                "total_available": 20,
            }
        )

        self.assertEqual(context.access_tier, "signup_bonus")
        self.assertIsNone(context.subscription_plan_type)
        self.assertIsNone(context.subscription_status)
        self.assertTrue(has_capability(context, "short_video_create"))
        self.assertFalse(has_capability(context, "merge_per_image_template"))
        self.assertFalse(context.limits.short_duration_editable)


if __name__ == "__main__":
    unittest.main()
