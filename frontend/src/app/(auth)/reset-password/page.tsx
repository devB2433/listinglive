"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { resetPassword, sendCode } from "@/lib/api";

export default function ResetPasswordPage() {
  const { translate } = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendCode() {
    setError("");
    setMessage("");
    if (!email) {
      setError(translate("auth.resetPassword.emailRequired"));
      return;
    }
    setSendingCode(true);
    try {
      const result = await sendCode(email);
      setMessage(
        result.debug_code
          ? translate("auth.resetPassword.codeSentDebug", { code: result.debug_code })
          : translate("auth.resetPassword.codeSent"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.resetPassword.sendCodeFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await resetPassword(email, code, newPassword);
      setMessage(translate("auth.resetPassword.success"));
      setCode("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.resetPassword.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{translate("auth.resetPassword.title")}</h1>
          <p className="text-sm text-gray-500">{translate("auth.resetPassword.subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.resetPassword.email")}</label>
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
                {sendingCode ? translate("auth.resetPassword.sendingCode") : translate("auth.resetPassword.sendCode")}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.resetPassword.code")}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder={translate("auth.resetPassword.codePlaceholder")}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.resetPassword.newPassword")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
            <p className="mt-1 text-xs text-gray-500">{translate("auth.resetPassword.helper")}</p>
          </div>
          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? translate("auth.resetPassword.submitting") : translate("auth.resetPassword.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          <Link href="/login" className="text-blue-600 hover:underline">
            {translate("auth.resetPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
