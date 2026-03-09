"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";

export default function AccountPage() {
  const { user } = useDashboardSession();
  const { translate } = useLocale();

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.accountPage.title")}</h2>
      <div className="mt-4 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
        <p>{translate("dashboard.accountPage.username")}：{user.username}</p>
        <p>{translate("dashboard.accountPage.email")}：{user.email}</p>
        <p>
          {translate("dashboard.accountPage.emailVerified")}：
          {user.email_verified ? translate("dashboard.accountPage.verified") : translate("dashboard.accountPage.unverified")}
        </p>
        <p>{translate("dashboard.accountPage.status")}：{user.status}</p>
      </div>
    </section>
  );
}
