import type { QuotaSnapshot } from "@/lib/api";

export type AccessTier = QuotaSnapshot["access_tier"];
export type CapabilityKey = QuotaSnapshot["capabilities"][number];
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function hasCapability(quota: QuotaSnapshot, capability: string) {
  return quota.capabilities.includes(capability);
}

const KNOWN_ACCESS_TIERS = ["signup_bonus", "basic", "pro", "ultimate", "none"] as const;

export function getAccessTierLabel(translate: Translate, accessTier: AccessTier) {
  const tier = accessTier && KNOWN_ACCESS_TIERS.includes(accessTier as (typeof KNOWN_ACCESS_TIERS)[number])
    ? accessTier
    : "none";
  return translate(`dashboard.accessTier.${tier}`);
}

export function getShortDurationSummary(translate: Translate, quota: QuotaSnapshot) {
  if (quota.limits.short_duration_editable) return translate("dashboard.quotaSummary.editableDuration");
  if (quota.limits.short_fixed_duration_seconds) {
    return translate("dashboard.quotaSummary.fixedDuration", { value: quota.limits.short_fixed_duration_seconds });
  }
  return translate("dashboard.quotaSummary.notEditable");
}

export function getStorageDaysSummary(translate: Translate, quota: QuotaSnapshot) {
  if (quota.limits.storage_days_display == null) return translate("dashboard.quotaSummary.storageUnknown");
  return translate("common.days", { value: quota.limits.storage_days_display });
}

export function isAdvancedAccess(quota: QuotaSnapshot) {
  return hasCapability(quota, "merge_per_image_template");
}

