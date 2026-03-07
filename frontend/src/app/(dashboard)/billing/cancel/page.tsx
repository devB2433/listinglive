"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/locale-provider";

export default function BillingCancelPage() {
  const { translate } = useLocale();

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.cancelTitle")}</h2>
      <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.cancelSubtitle")}</p>
      <div className="mt-4">
        <Link href="/billing" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700">
          {translate("dashboard.nav.billing")}
        </Link>
      </div>
    </section>
  );
}
