"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLocale } from "@/components/providers/locale-provider";
import { getPageTitle } from "@/components/dashboard/nav-items";
import { getAccessTierLabel, type AccessTier } from "@/lib/capabilities";

type DashboardHeaderProps = {
  onLogout: () => void;
  accessTier?: AccessTier;
  totalAvailable?: number;
};

export function DashboardHeader({ onLogout, accessTier, totalAvailable }: DashboardHeaderProps) {
  const pathname = usePathname();
  const { translate } = useLocale();
  const title = getPageTitle(translate, pathname);

  return (
    <header className="rounded-2xl border bg-white px-5 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">{translate("common.brand")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{title}</h1>
          {accessTier ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                {translate("dashboard.header.planBadge", { value: getAccessTierLabel(translate, accessTier) })}
              </span>
              {typeof totalAvailable === "number" ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {translate("dashboard.header.creditBadge", { count: totalAvailable })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/notifications" className="text-gray-600 hover:text-gray-900">
            {translate("common.notifications")}
          </Link>
          <Link href="/account" className="text-gray-600 hover:text-gray-900">
            {translate("common.account")}
          </Link>
          <button type="button" onClick={onLogout} className="text-blue-600 hover:text-blue-700">
            {translate("common.logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
