"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { getAccessTierLabel, getShortDurationSummary, isAdvancedAccess } from "@/lib/capabilities";

export default function DashboardPage() {
  const { user, quota } = useDashboardSession();
  const { translate } = useLocale();
  const capabilitySummary = useMemo(() => {
    if (quota.access_tier === "signup_bonus") return translate("dashboard.quotaSummary.signup");
    if (isAdvancedAccess(quota)) return translate("dashboard.quotaSummary.advanced");
    if (quota.access_tier === "basic") return translate("dashboard.quotaSummary.basic");
    return translate("dashboard.quotaSummary.none");
  }, [quota, translate]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-500">{translate("dashboard.overview.welcome")}</p>
        <h2 className="mt-2 text-2xl font-semibold text-gray-900">{user.username}</h2>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          {translate("dashboard.overview.subtitle")}
        </p>
        <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p className="font-medium">
            {translate("dashboard.header.currentPermission", { value: getAccessTierLabel(translate, quota.access_tier) })}
          </p>
          <p className="mt-1">{capabilitySummary}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/videos/create" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            {translate("dashboard.overview.createShort")}
          </Link>
          <Link href="/videos/tasks" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
            {translate("dashboard.overview.viewTasks")}
          </Link>
          <Link href="/billing" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
            {translate("dashboard.overview.viewQuota")}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={translate("dashboard.overview.totalQuota")}
          value={String(quota.total_available)}
          detail={translate("dashboard.overview.totalQuotaDetail")}
        />
        <SummaryCard
          title={translate("dashboard.overview.currentPlan")}
          value={getAccessTierLabel(translate, quota.access_tier)}
          detail={getShortDurationSummary(translate, quota)}
        />
        <SummaryCard
          title={translate("dashboard.overview.subscriptionRemaining")}
          value={String(quota.subscription_remaining)}
          detail={quota.subscription_plan_type || translate("common.notSubscribed")}
        />
        <SummaryCard
          title={translate("dashboard.overview.paidPackageRemaining")}
          value={String(quota.paid_package_remaining)}
          detail={translate("dashboard.overview.paidPackageDetail")}
        />
        <SummaryCard
          title={translate("dashboard.overview.signupBonusRemaining")}
          value={String(quota.signup_bonus_remaining)}
          detail={translate("dashboard.overview.signupBonusDetail")}
        />
      </section>
    </div>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{detail}</p>
    </div>
  );
}

