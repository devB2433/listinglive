"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { updateMyPreferences } from "@/lib/api";

export default function AccountLanguagePage() {
  const { accessToken, user, refreshSession } = useDashboardSession();
  const { setLocale, translate } = useLocale();
  const [preferredLanguage, setPreferredLanguage] = useState<"zh-CN" | "en">(user.preferred_language);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPreferredLanguage(user.preferred_language);
  }, [user.preferred_language]);

  async function handleSaveLanguage() {
    setSavingLanguage(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateMyPreferences(accessToken, { preferred_language: preferredLanguage });
      setLocale(updated.preferred_language, { persist: true });
      await refreshSession();
      setMessage(translate("locale.preferenceSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("locale.preferenceSaveFailed"));
    } finally {
      setSavingLanguage(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.languagePage.title")}</h2>
      <div className="mt-4 flex max-w-sm flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">{translate("dashboard.accountPage.preferredLanguage")}</label>
        <select
          value={preferredLanguage}
          onChange={(e) => setPreferredLanguage(e.target.value as "zh-CN" | "en")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="zh-CN">{translate("common.chinese")}</option>
          <option value="en">{translate("common.english")}</option>
        </select>
        <button
          type="button"
          onClick={() => void handleSaveLanguage()}
          disabled={savingLanguage}
          className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {savingLanguage ? translate("common.saving") : translate("dashboard.accountPage.saveLanguage")}
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </section>
  );
}
