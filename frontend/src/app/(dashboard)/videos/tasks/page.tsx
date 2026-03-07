"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { downloadVideoTask, getVideoTasks, type VideoTask } from "@/lib/api";
import { translateApiError, type Locale } from "@/lib/locale";

type TaskFilter = "all" | "queued" | "processing" | "succeeded" | "failed";
type TaskTypeFilter = "all" | "short" | "long";

export default function VideoTasksPage() {
  const { accessToken } = useDashboardSession();
  const { formatDate, locale, translate } = useLocale();
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>("all");
  const [downloadingTaskId, setDownloadingTaskId] = useState("");

  const hasRunningTask = useMemo(
    () => tasks.some((task) => task.status === "queued" || task.status === "processing" || task.status === "merging"),
    [tasks],
  );

  const visibleTasks = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((task) => task.status === filter);
  }, [filter, tasks]);

  const loadTasks = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);

    try {
      const taskData = await getVideoTasks(accessToken, { taskType: taskTypeFilter === "all" ? null : taskTypeFilter });
      setTasks(taskData);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, taskTypeFilter]);

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  useEffect(() => {
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      void loadTasks(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, loadTasks]);

  async function handleDownload(task: VideoTask) {
    setDownloadingTaskId(task.id);
    try {
      const blob = await downloadVideoTask(accessToken, task.id);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `listinglive-${task.id}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingTaskId("");
    }
  }

  if (loading) {
    return <PageLoading text={translate("dashboard.tasks.loading")} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.tasks.title")}</h2>
            <p className="mt-1 text-sm text-gray-500">{translate("dashboard.tasks.subtitle")}</p>
          </div>
          <button type="button" onClick={() => void loadTasks(true)} className="text-sm text-blue-600 hover:underline">
            {refreshing ? translate("common.refreshing") : translate("common.refresh")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["all", translate("dashboard.tasks.all")],
            ["queued", translate("dashboard.tasks.queued")],
            ["processing", translate("dashboard.tasks.processing")],
            ["succeeded", translate("dashboard.tasks.succeeded")],
            ["failed", translate("dashboard.tasks.failed")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as TaskFilter)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === value ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["all", translate("dashboard.tasks.allTypes")],
            ["short", translate("dashboard.tasks.shortType")],
            ["long", translate("dashboard.tasks.longType")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTaskTypeFilter(value as TaskTypeFilter)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                taskTypeFilter === value ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {visibleTasks.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-gray-500">{translate("dashboard.tasks.noTasks")}</div>
        )}
        {visibleTasks.map((task) => (
          <div key={task.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{renderStatus(translate, task.status)}</p>
                <p className="mt-1 text-sm text-gray-600">{translate("dashboard.tasks.taskType", { value: renderTaskType(translate, task.task_type) })}</p>
                <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.tasks.taskId", { id: task.id })}</p>
              </div>
              {task.status === "succeeded" && (
                <button
                  type="button"
                  onClick={() => void handleDownload(task)}
                  disabled={downloadingTaskId === task.id}
                  className="rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {downloadingTaskId === task.id ? translate("dashboard.tasks.downloading") : translate("dashboard.tasks.download")}
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
              <p>{translate("common.resolution")}：{task.resolution}</p>
              <p>{translate("common.aspectRatio")}：{task.aspect_ratio}</p>
              <p>{translate("common.duration")}：{translate("common.seconds", { value: task.duration_seconds })}</p>
              {task.segment_count ? <p>{translate("dashboard.tasks.segmentCount", { value: task.segment_count })}</p> : null}
              {task.segment_count ? <p>{translate("dashboard.tasks.completedSegments", { value: task.completed_segments ?? 0 })}</p> : null}
              <p>{translate("common.createdAt")}：{formatDate(task.created_at)}</p>
              {task.provider_name && <p>{translate("common.provider")}：{task.provider_name}</p>}
              {task.error_message && (
                <p className="text-red-600">
                  {translate("common.error")}：{renderTaskError(locale, task.error_message)}
                </p>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function PageLoading({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function renderStatus(translate: (key: string) => string, status: string) {
  if (status === "queued") return translate("dashboard.tasks.queued");
  if (status === "processing") return translate("dashboard.tasks.processing");
  if (status === "merging") return translate("dashboard.tasks.merging");
  if (status === "succeeded") return translate("dashboard.tasks.succeeded");
  if (status === "failed") return translate("dashboard.tasks.failed");
  return status;
}

function renderTaskType(translate: (key: string) => string, taskType: string) {
  if (taskType === "short") return translate("dashboard.tasks.shortType");
  if (taskType === "long") return translate("dashboard.tasks.longType");
  return taskType;
}

function renderTaskError(locale: Locale, errorMessage: string) {
  return translateApiError(errorMessage, locale) ?? errorMessage;
}
