"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { adminLogin, getMe } from "@/lib/api";
import { clearStoredTokens, getStoredAccessToken, setStoredTokens } from "@/lib/session";

const AUTOFILL_SAFE_INPUT_PROPS = {
  autoComplete: "off",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
} as const;

export default function AdminLoginPage() {
  const router = useRouter();
  const { translate } = useLocale();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      const token = getStoredAccessToken();
      if (!token) return;
      try {
        const user = await getMe(token);
        if (!cancelled && user.username === "root") {
          router.replace("/admin");
        }
      } catch {
        clearStoredTokens();
      }
    }

    void checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await adminLogin(usernameOrEmail, password, totpCode);
      await getMe(data.access_token);
      setStoredTokens(data);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("admin.login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {translate("admin.login.badge")}
          </div>
          <h1 className="text-2xl font-bold">{translate("admin.login.title")}</h1>
          <p className="text-sm text-gray-500">{translate("admin.login.subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("admin.login.usernameOrEmail")}</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("admin.login.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
              {...AUTOFILL_SAFE_INPUT_PROPS}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("admin.login.totpCode")}</label>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder={translate("admin.login.totpHint")}
              {...AUTOFILL_SAFE_INPUT_PROPS}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? translate("admin.login.submitting") : translate("admin.login.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          <Link href="/login" className="text-blue-600 hover:underline">
            {translate("admin.login.backToUserLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
