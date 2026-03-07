"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import {
  createCustomerPortal,
  createQuotaPackageCheckout,
  createSubscriptionCheckout,
  getChargeReconciliation,
  getQuotaPackagePlans,
  getSubscriptionPlans,
  type ChargeReconciliation,
  type ChargeReconciliationItem,
  type QuotaPackagePlan,
  type SubscriptionPlan,
} from "@/lib/api";
import { getAccessTierLabel, getShortDurationSummary, getStorageDaysSummary } from "@/lib/capabilities";

export default function BillingPage() {
  const { accessToken, quota, refreshQuota } = useDashboardSession();
  const { formatDate, translate } = useLocale();
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [quotaPackagePlans, setQuotaPackagePlans] = useState<QuotaPackagePlan[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [reconciliation, setReconciliation] = useState<ChargeReconciliation | null>(null);
  const [loadingReconciliation, setLoadingReconciliation] = useState(true);
  const [reconciliationError, setReconciliationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      setLoadingCatalogs(true);
      setLoadingReconciliation(true);
      setCatalogError("");
      setReconciliationError("");
      setActionError("");

      const [quotaResult, plansResult, packagePlansResult, reconciliationResult] = await Promise.allSettled([
        refreshQuota(),
        getSubscriptionPlans(accessToken),
        getQuotaPackagePlans(accessToken),
        getChargeReconciliation(accessToken, { limit: 20 }),
      ]);

      if (cancelled) return;

      if (plansResult.status === "fulfilled") {
        setSubscriptionPlans(plansResult.value);
      }
      if (packagePlansResult.status === "fulfilled") {
        setQuotaPackagePlans(packagePlansResult.value);
      }
      if (reconciliationResult.status === "fulfilled") {
        setReconciliation(reconciliationResult.value);
      } else {
        setReconciliation(null);
        setReconciliationError(translate("dashboard.billing.reconciliationLoadFailed"));
      }

      if (plansResult.status === "rejected" || packagePlansResult.status === "rejected" || quotaResult.status === "rejected") {
        setCatalogError(translate("dashboard.billing.plansLoadingSlow"));
      }

      setLoadingCatalogs(false);
      setLoadingReconciliation(false);
    }

    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshQuota, translate]);

  const hasSubscription = Boolean(quota.subscription_plan_type);

  async function redirectTo(url: string) {
    window.location.assign(url);
  }

  async function openCustomerPortal(actionKey: string) {
    setPendingAction(actionKey);
    setActionError("");
    try {
      const result = await createCustomerPortal(accessToken);
      await redirectTo(result.portal_url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate("common.requestFailed"));
      setPendingAction(null);
    }
  }

  async function handleSubscribe(planId: string) {
    const actionKey = `plan:${planId}`;
    setPendingAction(actionKey);
    setActionError("");
    try {
      const result = await createSubscriptionCheckout(accessToken, planId);
      await redirectTo(result.checkout_url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate("common.requestFailed"));
      setPendingAction(null);
    }
  }

  async function handleQuotaPackagePurchase(packagePlanId: string) {
    const actionKey = `package:${packagePlanId}`;
    setPendingAction(actionKey);
    setActionError("");
    try {
      const result = await createQuotaPackageCheckout(accessToken, packagePlanId);
      await redirectTo(result.checkout_url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate("common.requestFailed"));
      setPendingAction(null);
    }
  }

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
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.currentStatus")}</h2>
            {(quota.subscription_cancel_at_period_end || quota.subscription_current_period_end) && (
              <div className="mt-2 space-y-1 text-sm text-amber-700">
                {quota.subscription_cancel_at_period_end && <p>{translate("dashboard.billing.cancelAtPeriodEnd")}</p>}
                {quota.subscription_current_period_end && (
                  <p>
                    {translate("dashboard.billing.currentPeriodEnd", {
                      value: formatDate(quota.subscription_current_period_end),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void openCustomerPortal("portal:status")}
            disabled={pendingAction === "portal:status"}
            className="w-full rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 disabled:opacity-60 md:w-auto"
          >
            {pendingAction === "portal:status"
              ? translate("dashboard.billing.redirectPortal")
              : translate("dashboard.billing.manageAction")}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoPanel
            title={translate("common.accountStatus")}
            content={getAccessTierLabel(translate, quota.access_tier)}
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
        {actionError && <p className="mt-4 text-sm text-red-600">{actionError}</p>}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.reconciliationTitle")}</h2>
          </div>
        </div>
        {reconciliationError ? <p className="mt-4 text-sm text-amber-700">{reconciliationError}</p> : null}
        {loadingReconciliation ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-xl border bg-gray-50 p-4">
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-8 w-20 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-28 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : reconciliation ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title={translate("dashboard.billing.reconciliationPlannedTotal")}
                value={String(reconciliation.planned_total)}
                detail={translate("dashboard.billing.reconciliationPlannedDetail")}
              />
              <StatCard
                title={translate("dashboard.billing.reconciliationChargedTotal")}
                value={String(reconciliation.charged_total)}
                detail={translate("dashboard.billing.reconciliationChargedDetail")}
              />
              <StatCard
                title={translate("dashboard.billing.reconciliationPendingReserved")}
                value={String(reconciliation.pending_reserved_total)}
                detail={translate("dashboard.billing.reconciliationPendingDetail")}
              />
              <StatCard
                title={translate("dashboard.billing.reconciliationSuccessfulTasks")}
                value={String(reconciliation.successful_short_tasks + reconciliation.successful_long_tasks)}
                detail={translate("dashboard.billing.reconciliationSuccessfulDetail", {
                  short: reconciliation.successful_short_tasks,
                  long: reconciliation.successful_long_tasks,
                })}
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoPanel
                title={translate("dashboard.billing.reconciliationShortSummary")}
                content={translate("dashboard.billing.reconciliationShortSummaryValue", {
                  count: reconciliation.successful_short_tasks,
                })}
              />
              <InfoPanel
                title={translate("dashboard.billing.reconciliationLongSummary")}
                content={translate("dashboard.billing.reconciliationLongSummaryValue", {
                  count: reconciliation.successful_long_tasks,
                  segments: reconciliation.successful_long_segments,
                })}
              />
              <InfoPanel
                title={translate("dashboard.billing.reconciliationTaskCount")}
                content={translate("dashboard.billing.reconciliationTaskCountValue", {
                  count: reconciliation.total_tasks,
                })}
              />
            </div>
            <div className="mt-6 rounded-xl border">
              <div className="border-b bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{translate("dashboard.billing.reconciliationListTitle")}</p>
              </div>
              <div className="divide-y">
                {reconciliation.items.length > 0 ? (
                  reconciliation.items.map((item) => (
                    <ChargeItemRow key={item.task_id} item={item} formatDate={formatDate} translate={translate} />
                  ))
                ) : (
                  <div className="px-4 py-4 text-sm text-gray-500">{translate("dashboard.billing.reconciliationEmpty")}</div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.plansTitle")}</h2>
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
            const actionKey = `plan:${plan.id}`;
            const buttonLabel = isCurrent
              ? translate("dashboard.billing.manageAction")
              : hasSubscription
                ? translate("dashboard.billing.portalChangeAction")
                : translate("dashboard.billing.subscribeAction");
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
                <button
                  type="button"
                  onClick={() => {
                    if (hasSubscription) {
                      void openCustomerPortal(actionKey);
                      return;
                    }
                    void handleSubscribe(plan.id);
                  }}
                  disabled={pendingAction !== null}
                  className={`mt-4 w-full rounded-md border px-4 py-2 text-sm ${
                    isCurrent
                      ? "border-blue-500 bg-white text-blue-700"
                      : "border-blue-200 bg-blue-50 text-blue-700"
                  } disabled:opacity-60`}
                >
                  {pendingAction === actionKey
                    ? hasSubscription
                      ? translate("dashboard.billing.redirectPortal")
                      : translate("dashboard.billing.redirectCheckout")
                    : buttonLabel}
                </button>
              </div>
            );
          })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.packagePlansTitle")}</h2>
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
                onClick={() => void handleQuotaPackagePurchase(plan.id)}
                disabled={!quota.can_purchase_quota_package || pendingAction !== null}
                className={`mt-4 w-full rounded-md border px-4 py-2 text-sm ${
                  quota.can_purchase_quota_package
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
                } disabled:opacity-60`}
              >
                {pendingAction === `package:${plan.id}`
                  ? translate("dashboard.billing.redirectCheckout")
                  : quota.can_purchase_quota_package
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

function ChargeItemRow({
  item,
  formatDate,
  translate,
}: {
  item: ChargeReconciliationItem;
  formatDate: (value: string) => string;
  translate: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {renderBillingTaskType(translate, item.task_type)} · {renderBillingTaskStatus(translate, item.status)}
          </p>
          <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.billing.reconciliationTaskId", { id: item.task_id })}</p>
        </div>
        <div className="text-sm font-medium text-gray-900">
          {translate("dashboard.billing.reconciliationCreditUsage", {
            charged: item.charged_quota_consumed,
            planned: item.planned_quota_consumed,
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
        <p>{translate("dashboard.billing.reconciliationChargeStatus", { value: renderBillingChargeStatus(translate, item.charge_status) })}</p>
        <p>{translate("dashboard.billing.reconciliationCreatedAt", { value: formatDate(item.created_at) })}</p>
        {item.finished_at ? <p>{translate("dashboard.billing.reconciliationFinishedAt", { value: formatDate(item.finished_at) })}</p> : null}
        {item.charged_at ? <p>{translate("dashboard.billing.reconciliationChargedAt", { value: formatDate(item.charged_at) })}</p> : null}
      </div>
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

function renderBillingTaskType(
  translate: (key: string, vars?: Record<string, string | number>) => string,
  taskType: string,
) {
  if (taskType === "short") return translate("dashboard.tasks.shortType");
  if (taskType === "long") return translate("dashboard.tasks.longType");
  return taskType;
}

function renderBillingTaskStatus(
  translate: (key: string, vars?: Record<string, string | number>) => string,
  status: string,
) {
  if (status === "queued") return translate("dashboard.tasks.queued");
  if (status === "processing") return translate("dashboard.tasks.creating");
  if (status === "merging") return translate("dashboard.tasks.postProcessing");
  if (status === "succeeded") return translate("dashboard.tasks.completed");
  if (status === "failed") return translate("dashboard.tasks.failed");
  return status;
}

function renderBillingChargeStatus(
  translate: (key: string, vars?: Record<string, string | number>) => string,
  status: string,
) {
  if (status === "pending") return translate("dashboard.tasks.chargePending");
  if (status === "charged") return translate("dashboard.tasks.chargeCharged");
  if (status === "skipped") return translate("dashboard.tasks.chargeSkipped");
  return status;
}

