"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminSession } from "@/components/providers/admin-session-provider";
import { useLocale } from "@/components/providers/locale-provider";
import {
  blockAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
  unblockAdminUser,
  type AdminUserListItem,
  type AdminUserListResult,
} from "@/lib/api";

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { accessToken } = useAdminSession();
  const { translate, formatDate } = useLocale();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserListResult | null>(null);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const loadUsers = useCallback(async (nextPage = page) => {
    setError("");
    try {
      const result = await getAdminUsers(accessToken, { query, status, page: nextPage, pageSize: PAGE_SIZE });
      setData(result);
      setPage(nextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate("common.requestFailed"));
    }
  }, [accessToken, page, query, status, translate]);

  useEffect(() => {
    void loadUsers(1);
  }, [loadUsers]);

  async function handleBlock(user: AdminUserListItem) {
    setActionLoading(`block:${user.id}`);
    try {
      await blockAdminUser(accessToken, user.id);
      await loadUsers(page);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : translate("common.requestFailed"));
    } finally {
      setActionLoading("");
    }
  }

  async function handleUnblock(user: AdminUserListItem) {
    setActionLoading(`unblock:${user.id}`);
    try {
      await unblockAdminUser(accessToken, user.id);
      await loadUsers(page);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : translate("common.requestFailed"));
    } finally {
      setActionLoading("");
    }
  }

  async function handleResetPassword(user: AdminUserListItem) {
    const newPassword = window.prompt(translate("admin.users.promptNewPassword"));
    if (!newPassword) return;

    setActionLoading(`reset:${user.id}`);
    try {
      await resetAdminUserPassword(accessToken, user.id, newPassword);
      await loadUsers(page);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : translate("common.requestFailed"));
    } finally {
      setActionLoading("");
    }
  }

  const total = data?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate("admin.users.searchPlaceholder")}
            className="flex-1 rounded-md border px-3 py-2"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border px-3 py-2">
            <option value="">{translate("admin.users.allStatuses")}</option>
            <option value="active">{translate("admin.users.statusActive")}</option>
            <option value="blocked">{translate("admin.users.statusBlocked")}</option>
          </select>
          <button
            type="button"
            onClick={() => void loadUsers(1)}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {translate("admin.users.queryAction")}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Verified</th>
                <th className="px-3 py-2">{translate("admin.users.invitedByCode")}</th>
                <th className="px-3 py-2">{translate("common.createdAt")}</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-3 py-2 text-gray-900">{user.username}</td>
                  <td className="px-3 py-2 text-gray-700">{user.email}</td>
                  <td className="px-3 py-2 text-gray-700">{user.status}</td>
                  <td className="px-3 py-2 text-gray-700">{user.email_verified ? translate("common.yes") : translate("common.no")}</td>
                  <td className="px-3 py-2 text-gray-700">{user.invited_by_code ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-700">{formatDate(user.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {user.status === "blocked" ? (
                        <button
                          type="button"
                          onClick={() => void handleUnblock(user)}
                          disabled={actionLoading === `unblock:${user.id}`}
                          className="rounded-md border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {translate("admin.users.unblock")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleBlock(user)}
                          disabled={actionLoading === `block:${user.id}`}
                          className="rounded-md border px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {translate("admin.users.block")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleResetPassword(user)}
                        disabled={actionLoading === `reset:${user.id}`}
                        className="rounded-md border px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                      >
                        {translate("admin.users.resetPassword")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <p className="px-3 py-6 text-sm text-gray-500">{translate("admin.users.noUsers")}</p>}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">{translate("admin.list.pageInfo", { page, total })}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadUsers(page - 1)}
              disabled={!hasPrev}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              {translate("admin.list.prev")}
            </button>
            <button
              type="button"
              onClick={() => void loadUsers(page + 1)}
              disabled={!hasNext}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              {translate("admin.list.next")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
