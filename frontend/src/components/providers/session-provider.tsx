"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/providers/locale-provider";
import {
  getMe,
  getQuota,
  setUnauthorizedHandler,
  type QuotaSnapshot,
  type UserProfile,
} from "@/lib/api";
import { clearStoredTokens, getStoredAccessToken } from "@/lib/session";
import { warmVideoConfigCache } from "@/lib/video-config-cache";

const EMPTY_QUOTA: QuotaSnapshot = {
  subscription_plan_type: null,
  subscription_status: null,
  subscription_is_local_trial: false,
  subscription_is_billing_managed: false,
  subscription_cancel_at_period_end: false,
  trial_expires_at: null,
  subscription_current_period_start: null,
  subscription_current_period_end: null,
  subscription_remaining: 0,
  package_remaining: 0,
  paid_package_remaining: 0,
  signup_bonus_remaining: 0,
  invite_bonus_remaining: 0,
  total_available: 0,
  pending_reserved: 0,
  schedulable_available: 0,
  access_tier: "none",
  capabilities: [],
  can_purchase_quota_package: false,
  limits: {
    short_fixed_duration_seconds: null,
    short_duration_editable: false,
    allowed_resolutions: [],
    allowed_aspect_ratios: [],
    storage_days_display: null,
  },
};

type DashboardSessionContextValue = {
  accessToken: string;
  user: UserProfile;
  quota: QuotaSnapshot;
  refreshSession: () => Promise<void>;
  refreshQuota: () => Promise<QuotaSnapshot>;
  logout: () => void;
};

const DashboardSessionContext = createContext<DashboardSessionContextValue | null>(null);

export function DashboardSessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { translate } = useLocale();
  const sessionInitializedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot>(EMPTY_QUOTA);

  const handleUnauthorized = useCallback(() => {
    clearStoredTokens();
    router.replace("/login");
  }, [router]);

  const loadSession = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      handleUnauthorized();
      return;
    }

    setAccessToken(token);
    const shouldBlock = !sessionInitializedRef.current;
    if (shouldBlock) {
      setLoading(true);
    }
    try {
      const userData = await getMe(token);
      setUser(userData);
      sessionInitializedRef.current = true;
      void getQuota(token)
        .then((quotaData) => {
          setQuota(quotaData);
        })
        .catch(() => {
          // Keep the dashboard interactive even if quota refresh is temporarily slow.
        });
      void warmVideoConfigCache(token);
    } catch {
      handleUnauthorized();
      return;
    } finally {
      if (shouldBlock) {
        setLoading(false);
      }
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  const refreshQuota = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      handleUnauthorized();
      throw new Error("Not authenticated");
    }

    const latest = await getQuota(token).catch((error) => {
      handleUnauthorized();
      throw error;
    });
    setQuota(latest);
    return latest;
  }, [handleUnauthorized]);

  const logout = useCallback(() => {
    clearStoredTokens();
    router.replace("/login");
  }, [router]);

  const value = useMemo<DashboardSessionContextValue | null>(() => {
    if (!user || !accessToken) return null;
    return {
      accessToken,
      user,
      quota,
      refreshSession: loadSession,
      refreshQuota,
      logout,
    };
  }, [accessToken, loadSession, logout, quota, refreshQuota, user]);

  if (loading || value === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">{translate("dashboard.shell.loading")}</p>
      </div>
    );
  }

  return <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>;
}

export function useDashboardSession() {
  const context = useContext(DashboardSessionContext);
  if (!context) {
    throw new Error("useDashboardSession must be used inside DashboardSessionProvider");
  }
  return context;
}

