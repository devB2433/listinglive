"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { login, loginWithGoogle } from "@/lib/api";
import { setStoredTokens } from "@/lib/session";

const AUTOFILL_SAFE_INPUT_PROPS = {
  autoComplete: "off",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
} as const;

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts?: {
    id?: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: "outline" | "filled_blue" | "filled_black"; size: "large" | "medium" | "small"; text: string; width: number },
      ) => void;
    };
  };
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { translate } = useLocale();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

  useEffect(() => {
    const seed = (searchParams.get("invite_code") || searchParams.get("inviteCode") || "").trim().toUpperCase();
    if (seed) setInviteCode(seed);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(usernameOrEmail, password);
      setStoredTokens(data);
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.login.failed"));
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (credential?: string) => {
      if (!credential) {
        setError(translate("auth.login.googleUnavailable"));
        return;
      }
      setGoogleLoading(true);
      setError("");
      try {
        const data = await loginWithGoogle(credential, inviteCode.trim().toUpperCase());
        setStoredTokens(data);
        const next = searchParams.get("next");
        router.replace(next && next.startsWith("/") ? next : "/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : translate("auth.login.googleUnavailable"));
      } finally {
        setGoogleLoading(false);
      }
    },
    [inviteCode, router, searchParams, translate],
  );

  const initGoogleButton = useCallback(() => {
    if (!googleClientId || !googleButtonRef.current || typeof window === "undefined") return;
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!google?.accounts?.id) return;
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response: { credential?: string }) => {
        void handleGoogleCredential(response?.credential);
      },
    });
    googleButtonRef.current.innerHTML = "";
    google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: 340,
    });
  }, [googleClientId, handleGoogleCredential]);

  useEffect(() => {
    if (!googleClientId || typeof window === "undefined") return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const ensureGoogleButton = () => {
      if (cancelled) return;
      const google = (window as Window & { google?: GoogleIdentity }).google;
      if (google?.accounts?.id && googleButtonRef.current) {
        initGoogleButton();
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(ensureGoogleButton, 150);
      }
    };

    ensureGoogleButton();
    return () => {
      cancelled = true;
    };
  }, [googleClientId, initGoogleButton]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogleButton}
        />
      )}
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{translate("auth.login.title")}</h1>
          <p className="text-sm text-gray-500">{translate("auth.login.subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.login.usernameOrEmail")}</label>
            <input
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
              {...AUTOFILL_SAFE_INPUT_PROPS}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.login.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
              {...AUTOFILL_SAFE_INPUT_PROPS}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-right">
            <Link href="/reset-password" className="text-sm text-blue-600 hover:underline">
              {translate("auth.login.forgotPassword")}
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? translate("auth.login.submitting") : translate("auth.login.submit")}
          </button>
          <div className="pt-2">
            {googleClientId ? (
              <div className={googleLoading ? "opacity-60" : ""}>
                <div ref={googleButtonRef} />
              </div>
            ) : (
              <p className="text-xs text-gray-500">{translate("auth.login.googleUnavailable")}</p>
            )}
          </div>
        </form>
        <p className="text-center text-sm text-gray-600">
          {translate("auth.login.noAccount")}{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            {translate("auth.login.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <LoginPageContent />
    </Suspense>
  );
}
