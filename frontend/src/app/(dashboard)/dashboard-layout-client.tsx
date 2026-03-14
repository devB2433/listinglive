"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/header";
import { useLocale } from "@/components/providers/locale-provider";
import { DashboardSessionProvider, useDashboardSession } from "@/components/providers/session-provider";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { clearStoredTokens, getStoredAccessToken } from "@/lib/session";

export function DashboardLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const { translate } = useLocale();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  function handleLogout() {
    clearStoredTokens();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">{translate("dashboard.shell.checking")}</p>
      </div>
    );
  }

  return (
    <DashboardSessionProvider>
      <LocaleSyncFromUser />
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 md:px-6">
          <aside className="hidden w-72 shrink-0 md:block">
            <DashboardSidebar />
          </aside>
          <div className="min-w-0 flex-1 space-y-4">
            <HeaderWithSessionFallback onLogout={handleLogout} />
            <div className="md:hidden">
              <DashboardSidebar mobile />
            </div>
            <main>{children}</main>
          </div>
        </div>
      </div>
    </DashboardSessionProvider>
  );
}

function HeaderWithSessionFallback({ onLogout }: { onLogout: () => void }) {
  const { quota } = useDashboardSession();
  return <DashboardHeader onLogout={onLogout} accessTier={quota.access_tier} totalAvailable={quota.total_available} />;
}

function LocaleSyncFromUser() {
  const { user } = useDashboardSession();
  const { locale, setLocale } = useLocale();

  useEffect(() => {
    if (user.preferred_language !== locale) {
      setLocale(user.preferred_language, { persist: true });
    }
  }, [locale, setLocale, user.preferred_language]);

  return null;
}
