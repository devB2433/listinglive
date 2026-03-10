"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminSession } from "@/components/providers/admin-session-provider";
import { useLocale } from "@/components/providers/locale-provider";
import { createAdminInviteCode, getAdminInviteCodes, type InviteCode } from "@/lib/api";

export default function AdminInviteCodesPage() {
  const { accessToken } = useAdminSession();
  const { translate, formatDate } = useLocale();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCodes = useCallback(async () => {
    setError("");
    try {
      setCodes(await getAdminInviteCodes(accessToken));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate("common.requestFailed"));
    }
  }, [accessToken, translate]);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  async function handleCreate() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      await createAdminInviteCode(accessToken);
      setMessage(translate("admin.inviteCodes.generated"));
      await loadCodes();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : translate("common.requestFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code);
    setMessage(translate("admin.inviteCodes.copied"));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {translate("admin.inviteCodes.generate")}
        </button>
        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">{translate("common.createdAt")}</th>
                <th className="px-3 py-2">{translate("admin.inviteCodes.usedAt")}</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-gray-900">{item.code}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {item.used_by_user_id ? translate("admin.inviteCodes.used") : translate("admin.inviteCodes.unused")}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{formatDate(item.created_at)}</td>
                  <td className="px-3 py-2 text-gray-700">{item.used_at ? formatDate(item.used_at) : "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(item.code)}
                      className="rounded-md border px-3 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      {translate("admin.inviteCodes.copy")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {codes.length === 0 && <p className="px-3 py-6 text-sm text-gray-500">{translate("admin.inviteCodes.noCodes")}</p>}
        </div>
      </section>
    </div>
  );
}
