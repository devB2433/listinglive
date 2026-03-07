"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import {
  getQuotaPackagePlans,
  getSubscriptionPlans,
  type QuotaPackagePlan,
  type SubscriptionPlan,
} from "@/lib/api";
import { getAccessTierLabel, getShortDurationSummary, getStorageDaysSummary } from "@/lib/capabilities";

export default function BillingPage() {
  const { accessToken, quota } = useDashboardSession();
  const { translate } = useLocale();
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [quotaPackagePlans, setQuotaPackagePlans] = useState<QuotaPackagePlan[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      setLoadingCatalogs(true);
      setCatalogError("");

      const [plansResult, packagePlansResult] = await Promise.allSettled([
        getSubscriptionPlans(accessToken),
        getQuotaPackagePlans(accessToken),
      ]);

      if (cancelled) return;

      if (plansResult.status === "fulfilled") {
        setSubscriptionPlans(plansResult.value);
      }
      if (packagePlansResult.status === "fulfilled") {
        setQuotaPackagePlans(packagePlansResult.value);
      }

      if (plansResult.status === "rejected" || packagePlansResult.status === "rejected") {
        setCatalogError(translate("dashboard.billing.plansLoadingSlow"));
      }

      setLoadingCatalogs(false);
    }

    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [accessToken, translate]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={translate("dashboard.billing.totalQuota")}
          value={String(quota.total_available)}
          detail={translate("dashboard.billing.totalQuotaDetail")}
        />
        <StatCard
          title={translate("dashboard.overview.currentPlan")}
          value={getAccessTierLabel(translate, quota.access_tier)}
          detail={getShortDurationSummary(translate, quota)}
        />
        <StatCard
          title={translate("dashboard.overview.subscriptionRemaining")}
          value={String(quota.subscription_remaining)}
          detail={translate("dashboard.billing.currentPlanDetail")}
        />
        <StatCard
          title={translate("dashboard.overview.paidPackageRemaining")}
          value={String(quota.paid_package_remaining)}
          detail={translate("dashboard.billing.paidPackageDetail")}
        />
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.currentStatus")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoPanel
            title={translate("common.accountStatus")}
            content={`${getAccessTierLabel(translate, quota.access_tier)}. ${
              quota.access_tier === "signup_bonus"
                ? translate("dashboard.quotaSummary.signup")
                : translate("dashboard.billing.currentStatusDescription")
            }`}
          />
          <InfoPanel
            title={translate("dashboard.billing.signupBonusTitle")}
            content={translate("dashboard.billing.signupBonusDescription", { count: quota.signup_bonus_remaining })}
          />
          <InfoPanel
            title={translate("dashboard.billing.storageTitle")}
            content={translate("dashboard.billing.storageDescription", {
              value: getStorageDaysSummary(translate, quota),
            })}
          />
          <InfoPanel
            title={translate("dashboard.billing.packagePurchaseTitle")}
            content={
              quota.can_purchase_quota_package
                ? translate("dashboard.billing.packagePurchaseAllowed")
                : translate("dashboard.billing.packagePurchaseBlocked")
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.plansTitle")}</h2>
            <p className="mt-1 text-sm text-gray-500">{translate("dashboard.billing.plansSubtitle")}</p>
          </div>
        </div>
        {catalogError && <p className="mt-4 text-sm text-amber-700">{catalogError}</p>}
        {loadingCatalogs ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-xl border bg-gray-50 p-4">
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-4 w-28 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-24 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {subscriptionPlans.map((plan) => {
            const isCurrent = quota.subscription_plan_type === plan.plan_type;
            return (
              <div key={plan.id} className={`rounded-xl border p-4 ${isCurrent ? "border-blue-600 bg-blue-50" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold text-gray-900">{getPlanDisplayName(translate, plan.plan_type, plan.name)}</p>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-600 px-2 py-1 text-xs text-white">
                      {translate("dashboard.billing.currentSubscription")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.monthlyQuota", { value: plan.quota_per_month })}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {translate("dashboard.billing.storageDays", {
                    value: translate("common.days", { value: plan.storage_days }),
                  })}
                </p>
                <p className="mt-1 text-sm text-gray-600">{translate("dashboard.billing.priceCad", { value: plan.price_cad })}</p>
                <p className="mt-3 text-sm text-gray-600">
                  {plan.plan_type === "basic"
                    ? translate("dashboard.billing.basicPlanDesc")
                    : translate("dashboard.billing.advancedPlanDesc")}
                </p>
              </div>
            );
          })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.plannedTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500">{translate("dashboard.billing.plannedSubtitle")}</p>
        <div className="mt-4 rounded-xl border bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-gray-900">{translate("dashboard.billing.transitionFeatureTitle")}</p>
            <span className="rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-600">{translate("common.comingSoon")}</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.transitionFeatureDescription")}</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.packagePlansTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500">{translate("dashboard.billing.packagePlansSubtitle")}</p>
        {loadingCatalogs ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-xl border bg-gray-50 p-4">
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-4 w-28 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-24 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {quotaPackagePlans.map((plan) => (
            <div key={plan.id} className="rounded-xl border bg-gray-50 p-4">
              <p className="text-base font-semibold text-gray-900">{getPackageDisplayName(translate, plan.package_type, plan.name)}</p>
              <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.packageQuota", { value: plan.quota_amount })}</p>
              <p className="mt-1 text-sm text-gray-600">
                {translate("dashboard.billing.packageValidity", {
                  value: plan.validity_days ? translate("common.days", { value: plan.validity_days }) : translate("common.permanent"),
                })}
              </p>
              <p className="mt-1 text-sm text-gray-600">{translate("dashboard.billing.priceCad", { value: plan.price_cad })}</p>
              <p className="mt-3 text-sm text-gray-600">
                {quota.can_purchase_quota_package
                  ? translate("dashboard.billing.packagePurchasable")
                  : translate("dashboard.billing.packageNotPurchasable")}
              </p>
              <button
                type="button"
                disabled
                className={`mt-4 w-full rounded-md border px-4 py-2 text-sm ${
                  quota.can_purchase_quota_package
                    ? "border-blue-200 bg-blue-50 text-blue-700 opacity-70"
                    : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
                }`}
              >
                {quota.can_purchase_quota_package
                  ? translate("dashboard.billing.packageActionEnabled")
                  : translate("dashboard.billing.packageActionDisabled")}
              </button>
            </div>
          ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{detail}</p>
    </div>
  );
}

function InfoPanel({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <p className="font-medium text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-600">{content}</p>
    </div>
  );
}

function getPlanDisplayName(
  translate: (key: string, vars?: Record<string, string | number>) => string,
  planType: string,
  fallback: string,
) {
  if (planType === "basic") return translate("dashboard.billing.planNameBasic");
  if (planType === "pro") return translate("dashboard.billing.planNamePro");
  if (planType === "ultimate") return translate("dashboard.billing.planNameUltimate");
  return fallback;
}

function getPackageDisplayName(
  translate: (key: string, vars?: Record<string, string | number>) => string,
  packageType: string,
  fallback: string,
) {
  if (packageType === "pack_10") return translate("dashboard.billing.packageNamePack10");
  if (packageType === "pack_30") return translate("dashboard.billing.packageNamePack30");
  if (packageType === "pack_50") return translate("dashboard.billing.packageNamePack50");
  return fallback;
}

