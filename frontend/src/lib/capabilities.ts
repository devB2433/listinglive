import type { QuotaSnapshot } from "@/lib/api";

export type AccessTier = QuotaSnapshot["access_tier"];
export type CapabilityKey = QuotaSnapshot["capabilities"][number];
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function hasCapability(quota: QuotaSnapshot, capability: string) {
  return quota.capabilities.includes(capability);
}

export function getAccessTierLabel(translate: Translate, accessTier: AccessTier) {
  return translate(`dashboard.accessTier.${accessTier}`);
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

