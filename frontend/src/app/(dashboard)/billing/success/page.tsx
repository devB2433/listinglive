"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { clearBillingReturnIntent, getBillingReturnIntent, resolveBillingReturnTarget } from "@/lib/billing-return";

export default function BillingSuccessPage() {
  const { refreshQuota } = useDashboardSession();
  const { translate } = useLocale();
  const router = useRouter();
  const [redirectReady, setRedirectReady] = useState(false);
  const returnIntent = useMemo(() => getBillingReturnIntent(), []);
  const resumeHref = resolveBillingReturnTarget(returnIntent);

  useEffect(() => {
    let cancelled = false;
    void refreshQuota()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setRedirectReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshQuota]);

  useEffect(() => {
    if (!redirectReady || !returnIntent) return;
    clearBillingReturnIntent();
    router.replace(resolveBillingReturnTarget(returnIntent));
  }, [redirectReady, returnIntent, router]);

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.billing.successTitle")}</h2>
      <p className="mt-2 text-sm text-gray-600">{translate("dashboard.billing.successSubtitle")}</p>
      {returnIntent ? (
        <p className="mt-2 text-sm text-blue-700">
          {translate(
            returnIntent.resumeMode === "submit"
              ? "dashboard.billing.successResumeSubmit"
              : "dashboard.billing.successResumeEdit",
          )}
        </p>
      ) : null}
      <div className="mt-4">
        <Link href={resumeHref} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">
          {returnIntent ? translate("dashboard.billing.resumeAfterPurchase") : translate("dashboard.nav.billing")}
        </Link>
      </div>
    </section>
  );
}
