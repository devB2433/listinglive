"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { register, sendCode } from "@/lib/api";
import { setStoredTokens } from "@/lib/session";

export default function RegisterPage() {
  const router = useRouter();
  const { translate } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [registering, setRegistering] = useState(false);

  async function handleSendCode() {
    setError("");
    setMessage("");
    if (!email) {
      setError(translate("auth.register.emailRequired"));
      return;
    }
    setSendingCode(true);
    try {
      const result = await sendCode(email);
      setMessage(
        result.debug_code
          ? translate("auth.register.codeSentDebug", { code: result.debug_code })
          : translate("auth.register.codeSent"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.register.sendCodeFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setRegistering(true);
    try {
      const data = await register(username, password, email, code);
      setStoredTokens(data);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.register.registerFailed"));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{translate("auth.register.title")}</h1>
          <p className="text-sm text-gray-500">{translate("auth.register.subtitle")}</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4 rounded-2xl border bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.email")}</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2"
                required
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode}
                className="shrink-0 rounded-md bg-gray-600 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {sendingCode ? translate("auth.register.sendingCode") : translate("auth.register.sendCode")}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.code")}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder={translate("auth.register.codePlaceholder")}
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              {translate("auth.register.helper")}
            </p>
          </div>
          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={registering}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {registering ? translate("auth.register.submitting") : translate("auth.register.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          {translate("auth.register.hasAccount")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            {translate("auth.register.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
