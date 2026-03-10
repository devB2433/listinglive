"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { createMyInviteCode, getMyInviteCode, type InviteCode } from "@/lib/api";

export default function AccountPage() {
  const { accessToken, user } = useDashboardSession();
  const { translate } = useLocale();
  const [inviteCode, setInviteCode] = useState<InviteCode | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteActionLoading, setInviteActionLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInviteCode() {
      setInviteLoading(true);
      setInviteError("");
      try {
        const data = await getMyInviteCode(accessToken);
        if (!cancelled) {
          setInviteCode(data);
        }
      } catch (error) {
        if (!cancelled) {
          setInviteError(error instanceof Error ? error.message : translate("common.requestFailed"));
        }
      } finally {
        if (!cancelled) {
          setInviteLoading(false);
        }
      }
    }

    void loadInviteCode();
    return () => {
      cancelled = true;
    };
  }, [accessToken, translate]);

  async function handleCreateInviteCode() {
    setInviteActionLoading(true);
    setInviteError("");
    setInviteMessage("");
    try {
      const data = await createMyInviteCode(accessToken);
      setInviteCode(data);
      setInviteMessage(translate("dashboard.accountPage.inviteCodeCreated"));
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : translate("common.requestFailed"));
    } finally {
      setInviteActionLoading(false);
    }
  }

  async function handleCopyInviteCode() {
    if (!inviteCode?.code) return;
    try {
      await navigator.clipboard.writeText(inviteCode.code);
      setInviteMessage(translate("dashboard.accountPage.inviteCodeCopied"));
      setInviteError("");
    } catch {
      setInviteError(translate("dashboard.accountPage.inviteCodeCopyFailed"));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.accountPage.title")}</h2>
        <div className="mt-4 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
          <p>{translate("dashboard.accountPage.username")}：{user.username}</p>
          <p>{translate("dashboard.accountPage.email")}：{user.email}</p>
          <p>
            {translate("dashboard.accountPage.emailVerified")}：
            {user.email_verified ? translate("dashboard.accountPage.verified") : translate("dashboard.accountPage.unverified")}
          </p>
          <p>{translate("dashboard.accountPage.status")}：{user.status}</p>
        </div>
        <div className="mt-6">
          <Link href="/reset-password" className="inline-flex rounded-md border px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">
            {translate("dashboard.accountPage.resetPassword")}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.accountPage.inviteCodeTitle")}</h2>
        <p className="mt-2 text-sm text-gray-600">{translate("dashboard.accountPage.inviteCodeBenefitHint")}</p>
        {inviteMessage && <p className="mt-3 text-sm text-green-600">{inviteMessage}</p>}
        {inviteError && <p className="mt-3 text-sm text-red-600">{inviteError}</p>}
        {inviteLoading ? (
          <p className="mt-4 text-sm text-gray-500">{translate("dashboard.accountPage.inviteCodeLoading")}</p>
        ) : inviteCode ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">{translate("dashboard.accountPage.inviteCodeValueLabel")}</p>
              <p className="mt-1 text-2xl font-semibold tracking-[0.2em] text-blue-900">{inviteCode.code}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyInviteCode()}
              className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {translate("dashboard.accountPage.copyInviteCode")}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">{translate("dashboard.accountPage.inviteCodeEmpty")}</p>
            <div>
              <button
                type="button"
                onClick={() => void handleCreateInviteCode()}
                disabled={inviteActionLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {inviteActionLoading
                  ? translate("dashboard.accountPage.generatingInviteCode")
                  : translate("dashboard.accountPage.generateInviteCode")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
