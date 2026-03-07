"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";

export default function BillingSuccessPage() {
  const { refreshQuota } = useDashboardSession();
  const { translate } = useLocale();

  useEffect(() => {
    void refreshQuota().catch(() => undefined);
  }, [refreshQuota]);

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.successTitle")}</h2>
      <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.successSubtitle")}</p>
      <div className="mt-4">
        <Link href="/billing" className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">
          {translate("dashboard.nav.billing")}
        </Link>
      </div>
    </section>
  );
}
