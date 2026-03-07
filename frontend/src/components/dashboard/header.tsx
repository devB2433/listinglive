"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLocale } from "@/components/providers/locale-provider";
import { getPageTitle } from "@/components/dashboard/nav-items";
import { getAccessTierLabel, type AccessTier } from "@/lib/capabilities";

type DashboardHeaderProps = {
  onLogout: () => void;
  accessTier?: AccessTier;
};

export function DashboardHeader({ onLogout, accessTier }: DashboardHeaderProps) {
  const pathname = usePathname();
  const { translate } = useLocale();
  const title = getPageTitle(translate, pathname);

  return (
    <header className="rounded-2xl border bg-white px-5 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">{translate("common.brand")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{title}</h1>
          {accessTier && (
            <p className="mt-1 text-sm text-gray-500">
              {translate("dashboard.header.currentPermission", { value: getAccessTierLabel(translate, accessTier) })}
            </p>
          )}
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
