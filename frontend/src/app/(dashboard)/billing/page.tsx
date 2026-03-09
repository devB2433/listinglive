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
  upgradeSubscription,
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
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);
  const [reconciliationError, setReconciliationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [upgradeRecoveryUrl, setUpgradeRecoveryUrl] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [usageDetailExpanded, setUsageDetailExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      setLoadingCatalogs(true);
      setCatalogError("");

      const [quotaResult, plansResult, packagePlansResult] = await Promise.allSettled([
        refreshQuota(),
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
      if (plansResult.status === "rejected" || packagePlansResult.status === "rejected" || quotaResult.status === "rejected") {
        setCatalogError(translate("dashboard.billing.plansLoadingSlow"));
      }

      setLoadingCatalogs(false);
    }

    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshQuota, translate]);

  async function loadReconciliation() {
    if (reconciliation !== null) return;
    setLoadingReconciliation(true);
    setReconciliationError("");
    try {
      const data = await getChargeReconciliation(accessToken, { limit: 20 });
      setReconciliation(data);
    } catch {
      setReconciliationError(translate("dashboard.billing.reconciliationLoadFailed"));
    } finally {
      setLoadingReconciliation(false);
    }
  }

  const hasSubscription = Boolean(quota.subscription_plan_type);
  const PLAN_TIER_ORDER: Record<string, number> = { basic: 1, pro: 2, ultimate: 3 };
  const currentTier = PLAN_TIER_ORDER[quota.subscription_plan_type ?? ""] ?? 0;

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
      const url = result?.checkout_url;
      if (!url || typeof url !== "string") {
        setActionError(translate("dashboard.billing.checkoutUrlMissing"));
        setPendingAction(null);
        return;
      }
      await redirectTo(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate("common.requestFailed"));
      setPendingAction(null);
    }
  }

  async function handleUpgrade(planId: string) {
    const actionKey = `upgrade:${planId}`;
    setPendingAction(actionKey);
    setActionError("");
    setUpgradeRecoveryUrl(null);
    try {
      const result = await upgradeSubscription(accessToken, planId);
      if (result.result_status === "redirect_to_stripe") {
        const url = result.invoice_hosted_url;
        if (!url || typeof url !== "string") {
          setActionError(translate("dashboard.billing.upgradePaymentUrlMissing"));
          setPendingAction(null);
          return;
        }
        await redirectTo(url);
        return;
      }

      if (result.result_status === "applied_now") {
        await refreshQuota();
        setPendingAction(null);
        setActionError("");
        return;
      }

      setUpgradeRecoveryUrl(result.invoice_hosted_url ?? null);
      setActionError(translate("dashboard.billing.upgradePaymentFailed"));
      setPendingAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate("common.requestFailed"));
      setPendingAction(null);
    }
  }

  function getCurrentPlanLabel() {
    if (quota.access_tier === "signup_bonus") {
      return translate("dashboard.billing.freeUserLabel");
    }
    return getAccessTierLabel(translate, quota.access_tier);
  }

  return (
    <div className="space-y-6">
      {catalogError && <p className="text-sm text-amber-700">{catalogError}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      {upgradeRecoveryUrl && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void redirectTo(upgradeRecoveryUrl)}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            {translate("dashboard.billing.upgradeRetryPayment")}
          </button>
          <button
            type="button"
            onClick={() => void openCustomerPortal("portal:upgrade-recovery")}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {translate("dashboard.billing.managePaymentMethod")}
          </button>
        </div>
      )}

      {/* Block 1: 当前套餐 */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.currentPlanBlockTitle")}</h2>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xl font-semibold text-gray-900">{getCurrentPlanLabel()}</p>
            {quota.access_tier === "signup_bonus" && (
              <p className="mt-1 text-sm text-gray-600">{translate("dashboard.billing.freeUserDetail")}</p>
            )}
            {quota.access_tier === "signup_bonus" && (
              <p className="mt-1 text-sm text-gray-600">
                {translate("dashboard.billing.signupBonusDescription", { count: quota.signup_bonus_remaining })}
              </p>
            )}
            {hasSubscription && (
              <>
                {quota.subscription_cancel_at_period_end && (
                  <p className="mt-1 text-sm text-amber-700">{translate("dashboard.billing.cancelAtPeriodEnd")}</p>
                )}
                {quota.subscription_current_period_end && (
                  <p className="mt-1 text-sm text-gray-600">
                    {translate("dashboard.billing.currentPeriodEnd", {
                      value: formatDate(quota.subscription_current_period_end),
                    })}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {hasSubscription && (() => {
              const higherPlans = subscriptionPlans
                .filter((p) => (PLAN_TIER_ORDER[p.plan_type] ?? 0) > currentTier)
                .sort((a, b) => (PLAN_TIER_ORDER[b.plan_type] ?? 0) - (PLAN_TIER_ORDER[a.plan_type] ?? 0));
              const topPlan = higherPlans[0];
              return topPlan ? (
                <button
                  type="button"
                  onClick={() => void handleUpgrade(topPlan.id)}
                  disabled={pendingAction !== null}
                  className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {pendingAction === `upgrade:${topPlan.id}`
                    ? translate("dashboard.billing.redirectUpgradePayment")
                    : translate("dashboard.billing.upgradeTo", {
                        plan: getPlanDisplayName(translate, topPlan.plan_type, topPlan.name),
                      })}
                </button>
              ) : null;
            })()}
            {hasSubscription && (
              <button
                type="button"
                onClick={() => void openCustomerPortal("portal:status")}
                disabled={pendingAction === "portal:status"}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {pendingAction === "portal:status"
                  ? translate("dashboard.billing.redirectPortal")
                  : translate("dashboard.billing.manageAction")}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Block 2: 可选套餐与扩展包 */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.availablePlansBlockTitle")}</h2>
        {loadingCatalogs ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-xl border bg-gray-50 p-4">
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-4 w-28 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {subscriptionPlans.map((plan) => {
                const isCurrent = quota.subscription_plan_type === plan.plan_type;
                const planTier = PLAN_TIER_ORDER[plan.plan_type] ?? 0;
                const isUpgrade = hasSubscription && !isCurrent && planTier > currentTier;
                const isDowngrade = hasSubscription && !isCurrent && planTier < currentTier;

                let buttonLabel: string;
                let actionKey: string;
                if (isCurrent) {
                  buttonLabel = translate("dashboard.billing.manageAction");
                  actionKey = `plan:${plan.id}`;
                } else if (isUpgrade) {
                  buttonLabel = translate("dashboard.billing.upgradeTo", {
                    plan: getPlanDisplayName(translate, plan.plan_type, plan.name),
                  });
                  actionKey = `upgrade:${plan.id}`;
                } else if (!hasSubscription) {
                  buttonLabel = translate("dashboard.billing.subscribeAction");
                  actionKey = `plan:${plan.id}`;
                } else {
                  buttonLabel = "";
                  actionKey = "";
                }

                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-4 ${isCurrent ? "border-blue-600 bg-blue-50/50" : "bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">
                        {getPlanDisplayName(translate, plan.plan_type, plan.name)}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                          {translate("dashboard.billing.currentSubscription")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {translate("dashboard.billing.monthlyQuota", { value: plan.quota_per_month })} ·{" "}
                      {translate("dashboard.billing.priceCad", { value: plan.price_cad })}
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      {plan.plan_type === "basic"
                        ? translate("dashboard.billing.basicPlanDesc")
                        : translate("dashboard.billing.advancedPlanDesc")}
                    </p>
                    {!isDowngrade && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            void openCustomerPortal(actionKey);
                          } else if (isUpgrade) {
                            void handleUpgrade(plan.id);
                          } else {
                            void handleSubscribe(plan.id);
                          }
                        }}
                        disabled={pendingAction !== null}
                        className={`mt-4 w-full rounded-md border px-4 py-2 text-sm ${
                          isCurrent
                            ? "border-blue-500 bg-white text-blue-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        } disabled:opacity-60`}
                      >
                        {pendingAction === actionKey
                          ? isUpgrade
                            ? translate("dashboard.billing.redirectUpgradePayment")
                            : translate("dashboard.billing.redirectCheckout")
                          : buttonLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700">
                {translate("dashboard.billing.packagePlansTitle")}
              </h3>
              <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quotaPackagePlans.map((plan) => (
                  <div key={plan.id} className="rounded-xl border bg-gray-50 p-4">
                    <p className="font-semibold text-gray-900">
                      {getPackageDisplayName(translate, plan.package_type, plan.name)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {translate("dashboard.billing.packageQuota", { value: plan.quota_amount })} ·{" "}
                      {translate("dashboard.billing.priceCad", { value: plan.price_cad })}
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
                        : translate("dashboard.billing.packageActionEnabled")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Block 3: 当前权益与有效期 */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.entitlementsAndValidityTitle")}</h2>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700">
            {getShortDurationSummary(translate, quota)} · {getStorageDaysSummary(translate, quota)}
          </p>
          <p className="text-sm text-gray-600">
            {quota.can_purchase_quota_package
              ? translate("dashboard.billing.packagePurchaseAllowed")
              : translate("dashboard.billing.packagePurchaseBlocked")}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-medium text-gray-900">
              {translate("dashboard.billing.totalQuota")}: {quota.total_available}
            </span>
            <span className="text-gray-600">
              {translate("dashboard.overview.subscriptionRemaining")} {quota.subscription_remaining}
            </span>
            <span className="text-gray-600">
              {translate("dashboard.overview.paidPackageRemaining")} {quota.paid_package_remaining}
            </span>
            <span className="text-gray-600">
              {translate("dashboard.billing.signupBonusTitle")} {quota.signup_bonus_remaining}
            </span>
          </div>
        </div>
      </section>

      {/* 用量明细：折叠，按需加载 */}
      <section className="rounded-2xl border bg-white p-6">
        <button
          type="button"
          onClick={() => {
            setUsageDetailExpanded(!usageDetailExpanded);
            if (!usageDetailExpanded) void loadReconciliation();
          }}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          {usageDetailExpanded ? translate("dashboard.billing.collapseUsageDetail") : translate("dashboard.billing.viewUsageDetail")}
        </button>
        {usageDetailExpanded && (
          <div className="mt-4">
            {reconciliationError && <p className="text-sm text-amber-700">{reconciliationError}</p>}
            {loadingReconciliation && (
              <div className="mt-4 h-24 rounded-xl bg-gray-50" />
            )}
            {reconciliation && !loadingReconciliation && (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">{translate("dashboard.billing.reconciliationPlannedTotal")}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{reconciliation.planned_total}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">{translate("dashboard.billing.reconciliationChargedTotal")}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{reconciliation.charged_total}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">{translate("dashboard.billing.reconciliationPendingReserved")}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{reconciliation.pending_reserved_total}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">{translate("dashboard.billing.reconciliationSuccessfulTasks")}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {reconciliation.successful_short_tasks + reconciliation.successful_long_tasks}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border">
                  <div className="border-b bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {translate("dashboard.billing.reconciliationListTitle")}
                    </p>
                  </div>
                  <div className="divide-y">
                    {reconciliation.items.length > 0 ? (
                      reconciliation.items.map((item) => (
                        <ChargeItemRow key={item.task_id} item={item} formatDate={formatDate} translate={translate} />
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-gray-500">
                        {translate("dashboard.billing.reconciliationEmpty")}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>
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
          <p className="mt-1 break-all text-xs text-gray-500">
            {translate("dashboard.billing.reconciliationTaskId", { id: item.task_id })}
          </p>
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
        {item.finished_at && (
          <p>{translate("dashboard.billing.reconciliationFinishedAt", { value: formatDate(item.finished_at) })}</p>
        )}
        {item.charged_at && (
          <p>{translate("dashboard.billing.reconciliationChargedAt", { value: formatDate(item.charged_at) })}</p>
        )}
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
