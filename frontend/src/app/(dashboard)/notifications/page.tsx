"use client";

import { useLocale } from "@/components/providers/locale-provider";

export default function NotificationsPage() {
  const { translate } = useLocale();

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.notifications.title")}</h2>
    </div>
  );
}
