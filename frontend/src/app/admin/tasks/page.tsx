"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { useAdminSession } from "@/components/providers/admin-session-provider";
import { useLocale } from "@/components/providers/locale-provider";
import { getAdminTasks, type AdminTaskListResult } from "@/lib/api";
import { translateApiError } from "@/lib/locale";

const PAGE_SIZE = 20;

export default function AdminTasksPage() {
  const { accessToken } = useAdminSession();
  const { translate, formatDate, locale } = useLocale();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [taskType, setTaskType] = useState("");
  const [serviceTier, setServiceTier] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminTaskListResult | null>(null);
  const [error, setError] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState("");

  const loadTasks = useCallback(async (nextPage = page) => {
    setError("");
    try {
      const result = await getAdminTasks(accessToken, {
        query,
        status,
        taskType,
        serviceTier,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setData(result);
      setPage(nextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate("common.requestFailed"));
    }
  }, [accessToken, page, query, serviceTier, status, taskType, translate]);

  useEffect(() => {
    void loadTasks(1);
  }, [loadTasks]);

  const total = data?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate("admin.tasks.searchPlaceholder")}
            className="rounded-md border px-3 py-2"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border px-3 py-2">
            <option value="">{translate("admin.tasks.allStatuses")}</option>
            <option value="queued">queued</option>
            <option value="processing">processing</option>
            <option value="submitted">submitted</option>
            <option value="provider_processing">provider_processing</option>
            <option value="finalizing">finalizing</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value)} className="rounded-md border px-3 py-2">
            <option value="">{translate("admin.tasks.allTaskTypes")}</option>
            <option value="short">short</option>
            <option value="long">long</option>
          </select>
          <select value={serviceTier} onChange={(event) => setServiceTier(event.target.value)} className="rounded-md border px-3 py-2">
            <option value="">{translate("admin.tasks.allServiceTiers")}</option>
            <option value="standard">standard</option>
            <option value="flex">flex</option>
          </select>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void loadTasks(1)}
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
                <th className="px-3 py-2">Task ID</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">{translate("admin.tasks.errorCode")}</th>
                <th className="px-3 py-2">Credits</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">{translate("common.error")}</th>
                <th className="px-3 py-2">{translate("admin.tasks.inspect")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((task) => {
                const translatedError = task.error_code ? translateApiError(task.error_code, locale) ?? task.error_code : null;
                const operationalError = task.error_message ?? translatedError ?? "-";
                const isExpanded = expandedTaskId === task.id;
                return (
                  <Fragment key={task.id}>
                    <tr className="border-t align-top">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{task.id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        <p className="font-medium text-gray-900">{task.username}</p>
                        <p>{task.email}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{task.task_type}</td>
                      <td className="px-3 py-2 text-gray-700">{task.service_tier}</td>
                      <td className="px-3 py-2 text-gray-700">{task.status}</td>
                      <td className="px-3 py-2 text-gray-700">{task.provider_status ?? task.provider_name ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{task.error_code ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {task.charged_quota_consumed}/{task.planned_quota_consumed}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{formatDate(task.created_at)}</td>
                      <td className="px-3 py-2 text-gray-700">{task.processing_seconds ?? task.queue_wait_seconds ?? 0}s</td>
                      <td className="px-3 py-2 text-gray-700">{operationalError}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedTaskId(isExpanded ? "" : task.id)}
                          className="rounded-md border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {isExpanded ? translate("admin.tasks.hideDetails") : translate("admin.tasks.showDetails")}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-t bg-gray-50">
                        <td colSpan={12} className="px-4 py-4">
                          <div className="grid gap-3 text-sm text-gray-700 md:grid-cols-2">
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.errorCode")}:</span> <span className="font-mono">{task.error_code ?? "-"}</span></p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.errorSource")}:</span> {task.error_source ?? "-"}</p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.retryable")}:</span> {task.error_retryable == null ? "-" : task.error_retryable ? translate("admin.tasks.yes") : translate("admin.tasks.no")}</p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.providerTaskId")}:</span> <span className="font-mono break-all">{task.provider_task_id ?? "-"}</span></p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.providerSubmittedAt")}:</span> {task.provider_submitted_at ? formatDate(task.provider_submitted_at) : "-"}</p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.providerLastPolledAt")}:</span> {task.provider_last_polled_at ? formatDate(task.provider_last_polled_at) : "-"}</p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.providerCompletedAt")}:</span> {task.provider_completed_at ? formatDate(task.provider_completed_at) : "-"}</p>
                            <p><span className="font-medium text-gray-900">{translate("admin.tasks.userFacingMessage")}:</span> {task.error_message ?? "-"}</p>
                          </div>
                          {translatedError ? (
                            <p className="mt-3 text-sm text-gray-700">
                              <span className="font-medium text-gray-900">{translate("admin.tasks.translatedSummary")}:</span> {translatedError}
                            </p>
                          ) : null}
                          {task.error_detail ? (
                            <div className="mt-3">
                              <p className="font-medium text-gray-900">{translate("admin.tasks.diagnosticDetail")}</p>
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl border bg-white p-3 text-xs text-gray-700">
                                {task.error_detail}
                              </pre>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {data && data.items.length === 0 && <p className="px-3 py-6 text-sm text-gray-500">{translate("admin.tasks.noTasks")}</p>}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">{translate("admin.list.pageInfo", { page, total })}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadTasks(page - 1)}
              disabled={!hasPrev}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              {translate("admin.list.prev")}
            </button>
            <button
              type="button"
              onClick={() => void loadTasks(page + 1)}
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
