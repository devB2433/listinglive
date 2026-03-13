"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/providers/locale-provider";
import { getMe, setUnauthorizedHandler, type UserProfile } from "@/lib/api";
import { clearStoredTokens, getStoredAccessToken } from "@/lib/session";

type AdminSessionContextValue = {
  accessToken: string;
  user: UserProfile;
  logout: () => void;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { translate } = useLocale();
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminSession() {
      const token = getStoredAccessToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }

      try {
        const userData = await getMe(token);
        if (userData.username !== "root") {
          router.replace("/dashboard");
          return;
        }
        if (!cancelled) {
          setAccessToken(token);
          setUser(userData);
        }
      } catch {
        clearStoredTokens();
        router.replace("/admin/login");
        return;
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAdminSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(() => {
    clearStoredTokens();
    router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo<AdminSessionContextValue | null>(() => {
    if (!user || !accessToken) return null;
    return { accessToken, user, logout };
  }, [accessToken, logout, user]);

  if (loading || value === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">{translate("admin.shell.loading")}</p>
      </div>
    );
  }

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error("useAdminSession must be used inside AdminSessionProvider");
  }
  return context;
}
