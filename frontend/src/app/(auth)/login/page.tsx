"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { login } from "@/lib/api";
import { setStoredTokens } from "@/lib/session";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { translate } = useLocale();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
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
