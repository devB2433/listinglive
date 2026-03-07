"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import {
  createLongVideoTask,
  createShortVideoTask,
  downloadVideoTask,
  getVideoTasks,
  retryVideoTask,
  uploadVideoAsset,
  type LongVideoSegmentStatus,
  type VideoTask,
} from "@/lib/api";
import { translateApiError, type Locale } from "@/lib/locale";
import { deletePendingVideoDraft, getPendingVideoDraft, type PendingVideoDraft } from "@/lib/pending-video-task";

type UserFacingTaskStatus = "uploading" | "queued" | "creating" | "post_processing" | "completed" | "failed";
type TaskFilter = "all" | UserFacingTaskStatus;
type TaskTypeFilter = "all" | "short" | "long";
type PendingTaskView = {
  id: string;
  task_type: "short" | "long";
  status: "uploading" | "failed";
  resolution: string;
  aspect_ratio: string;
  duration_seconds: number;
  segment_count?: number | null;
  planned_quota_consumed: number;
  charged_quota_consumed: number;
  created_at: string;
  error_message?: string;
};
type TaskListEntry = { kind: "pending"; task: PendingTaskView } | { kind: "task"; task: VideoTask };

export default function VideoTasksPage() {
  const { accessToken, refreshQuota } = useDashboardSession();
  const { formatDate, locale, translate } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDraftId = searchParams.get("draft");
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTaskView[]>(() => {
    if (!initialDraftId) return [];
    const draft = getPendingVideoDraft(initialDraftId);
    return draft ? [buildPendingTaskView(draft)] : [];
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>("all");
  const [downloadingTaskId, setDownloadingTaskId] = useState("");
  const [retryingTaskId, setRetryingTaskId] = useState("");
  const startedDraftIdsRef = useRef<Set<string>>(new Set());

  const hasRunningTask = useMemo(
    () =>
      pendingTasks.some((task) => task.status === "uploading") ||
      tasks.some((task) => task.status === "queued" || task.status === "processing" || task.status === "merging"),
    [pendingTasks, tasks],
  );

  const loadTasks = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);

    try {
      const taskData = await getVideoTasks(accessToken, { taskType: taskTypeFilter === "all" ? null : taskTypeFilter });
      setTasks(taskData);
      try {
        await refreshQuota();
      } catch {
        // Keep task polling resilient even if quota refresh fails temporarily.
      }
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, refreshQuota, taskTypeFilter]);

  const submitPendingDraft = useCallback(async (draft: PendingVideoDraft) => {
    try {
      let task: VideoTask;
      if (draft.task_type === "short") {
        const imageUpload = await uploadVideoAsset(accessToken, draft.image_file, "image");
        task = await createShortVideoTask(accessToken, {
          image_key: imageUpload.key,
          scene_template_id: draft.scene_template_id,
          resolution: draft.resolution,
          aspect_ratio: draft.aspect_ratio,
          duration_seconds: draft.duration_seconds,
          logo_key: draft.logo_key ?? null,
        });
      } else {
        const uploads = await Promise.all(draft.segments.map((segment) => uploadVideoAsset(accessToken, segment.file, "image")));
        const uploadedKeysBySegmentId = new Map(draft.segments.map((segment, index) => [segment.id, uploads[index].key]));
        const originalOrderedImageKeys = [...draft.segments]
          .sort((left, right) => left.source_index - right.source_index)
          .map((segment) => uploadedKeysBySegmentId.get(segment.id) || "");
        const orderedSegments =
          draft.edit_mode === "custom"
            ? draft.segments
            : [...draft.segments].sort((left, right) => left.source_index - right.source_index);
        const firstSegment = orderedSegments[0];
        task = await createLongVideoTask(accessToken, {
          image_keys: originalOrderedImageKeys,
          scene_template_id: draft.edit_mode === "custom" ? firstSegment?.scene_template_id || draft.scene_template_id : draft.scene_template_id,
          resolution: draft.resolution,
          aspect_ratio: draft.aspect_ratio,
          duration_seconds: draft.edit_mode === "custom" ? firstSegment?.duration_seconds || draft.duration_seconds : draft.duration_seconds,
          logo_key: draft.logo_key ?? null,
          segments:
            draft.edit_mode === "custom"
              ? orderedSegments.map((segment, index) => ({
                  image_key: uploadedKeysBySegmentId.get(segment.id) || "",
                  scene_template_id: segment.scene_template_id,
                  duration_seconds: segment.duration_seconds,
                  sort_order: index,
                }))
              : null,
        });
      }

      deletePendingVideoDraft(draft.id);
      setPendingTasks((current) => current.filter((item) => item.id !== draft.id));
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      await refreshQuota();
      await loadTasks(true);
    } catch (error) {
      deletePendingVideoDraft(draft.id);
      setPendingTasks((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: "failed",
                error_message: error instanceof Error ? error.message : translate("dashboard.tasks.failed"),
              }
            : item,
        ),
      );
    }
  }, [accessToken, loadTasks, refreshQuota, translate]);

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  useEffect(() => {
    const draftId = searchParams.get("draft");
    if (!draftId || startedDraftIdsRef.current.has(draftId)) return;
    const draft = getPendingVideoDraft(draftId);
    if (!draft) return;
    startedDraftIdsRef.current.add(draftId);
    setPendingTasks((current) => (current.some((item) => item.id === draft.id) ? current : [buildPendingTaskView(draft), ...current]));
    router.replace("/videos/tasks");
    void submitPendingDraft(draft);
  }, [router, searchParams, submitPendingDraft]);

  useEffect(() => {
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      void loadTasks(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, loadTasks]);

  const visibleEntries = useMemo(() => {
    const pendingEntries = pendingTasks
      .filter((task) => taskTypeFilter === "all" || task.task_type === taskTypeFilter)
      .map((task) => ({ kind: "pending" as const, task }));
    const taskEntries = tasks
      .filter((task) => taskTypeFilter === "all" || task.task_type === taskTypeFilter)
      .map((task) => ({ kind: "task" as const, task }));
    const combined: TaskListEntry[] = [...pendingEntries, ...taskEntries];
    if (filter === "all") return combined;
    return combined.filter((entry) => getUserFacingTaskStatus(entry.task) === filter);
  }, [filter, pendingTasks, taskTypeFilter, tasks]);

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

  async function handleRetry(task: VideoTask) {
    setRetryingTaskId(task.id);
    try {
      await retryVideoTask(accessToken, task.id);
      await loadTasks(true);
    } finally {
      setRetryingTaskId("");
    }
  }

  if (loading && pendingTasks.length === 0) {
    return <PageLoading text={translate("dashboard.tasks.loading")} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.tasks.title")}</h2>
          </div>
          <button type="button" onClick={() => void loadTasks(true)} className="text-sm text-blue-600 hover:underline">
            {refreshing ? translate("common.refreshing") : translate("common.refresh")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["all", translate("dashboard.tasks.all")],
            ["uploading", translate("dashboard.tasks.uploading")],
            ["queued", translate("dashboard.tasks.queued")],
            ["creating", translate("dashboard.tasks.creating")],
            ["post_processing", translate("dashboard.tasks.postProcessing")],
            ["completed", translate("dashboard.tasks.completed")],
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
        {visibleEntries.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-gray-500">{translate("dashboard.tasks.noTasks")}</div>
        )}
        {visibleEntries.map((entry) =>
          entry.kind === "pending" ? (
            <PendingTaskCard key={entry.task.id} task={entry.task} formatDate={formatDate} locale={locale} translate={translate} />
          ) : (
            <TaskCard
              key={entry.task.id}
              task={entry.task}
              downloadingTaskId={downloadingTaskId}
              retryingTaskId={retryingTaskId}
              formatDate={formatDate}
              locale={locale}
              translate={translate}
              onDownload={handleDownload}
              onRetry={handleRetry}
            />
          ),
        )}
      </section>
    </div>
  );
}

function PendingTaskCard({
  task,
  formatDate,
  locale,
  translate,
}: {
  task: PendingTaskView;
  formatDate: (value: string) => string;
  locale: Locale;
  translate: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{renderPendingTaskStatus(translate, task.status)}</p>
          <p className="mt-1 text-sm text-gray-600">{translate("dashboard.tasks.taskType", { value: renderTaskType(translate, task.task_type) })}</p>
          <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.tasks.taskId", { id: task.id })}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
        <p>{translate("common.resolution")}：{task.resolution}</p>
        <p>{translate("common.aspectRatio")}：{task.aspect_ratio}</p>
        <p>{translate("common.duration")}：{translate("common.seconds", { value: task.duration_seconds })}</p>
        <p>{translate("dashboard.tasks.creditUsage", { charged: task.charged_quota_consumed, planned: task.planned_quota_consumed })}</p>
        {task.segment_count ? <p>{translate("dashboard.tasks.segmentCount", { value: task.segment_count })}</p> : null}
        <p>{translate("common.createdAt")}：{formatDate(task.created_at)}</p>
        {task.error_message ? (
          <p className="text-red-600">
            {translate("common.error")}：{renderTaskError(locale, task.error_message)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  downloadingTaskId,
  retryingTaskId,
  formatDate,
  locale,
  translate,
  onDownload,
  onRetry,
}: {
  task: VideoTask;
  downloadingTaskId: string;
  retryingTaskId: string;
  formatDate: (value: string) => string;
  locale: Locale;
  translate: (key: string, params?: Record<string, string | number>) => string;
  onDownload: (task: VideoTask) => Promise<void>;
  onRetry: (task: VideoTask) => Promise<void>;
}) {
  const hasFailedLongSegments = task.task_type === "long" && !!task.long_segments?.some((segment) => segment.status === "failed");

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{renderStatus(translate, task.status, task.task_type, hasFailedLongSegments)}</p>
          <p className="mt-1 text-sm text-gray-600">{translate("dashboard.tasks.taskType", { value: renderTaskType(translate, task.task_type) })}</p>
          <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.tasks.taskId", { id: task.id })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasFailedLongSegments ? (
            <button
              type="button"
              onClick={() => void onRetry(task)}
              disabled={retryingTaskId === task.id}
              className="rounded-md border px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              {retryingTaskId === task.id ? translate("dashboard.tasks.retrying") : translate("dashboard.tasks.retry")}
            </button>
          ) : null}
          {task.status === "succeeded" && (
            <button
              type="button"
              onClick={() => void onDownload(task)}
              disabled={downloadingTaskId === task.id}
              className="rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              {downloadingTaskId === task.id ? translate("dashboard.tasks.downloading") : translate("dashboard.tasks.download")}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
        <p>{translate("common.resolution")}：{task.resolution}</p>
        <p>{translate("common.aspectRatio")}：{task.aspect_ratio}</p>
        <p>{translate("common.duration")}：{translate("common.seconds", { value: task.duration_seconds })}</p>
        <p>{translate("dashboard.tasks.creditUsage", { charged: task.charged_quota_consumed, planned: task.planned_quota_consumed })}</p>
        <p>{translate("dashboard.tasks.chargeStatusLabel", { value: renderChargeStatus(translate, task.charge_status) })}</p>
        {task.segment_count ? <p>{translate("dashboard.tasks.segmentCount", { value: task.segment_count })}</p> : null}
        {task.segment_count ? <p>{translate("dashboard.tasks.completedSegments", { value: task.completed_segments ?? 0 })}</p> : null}
        <p>{translate("common.createdAt")}：{formatDate(task.created_at)}</p>
        <p>{translate("dashboard.tasks.queuedAt", { value: formatDate(task.queued_at) })}</p>
        {task.processing_started_at ? <p>{translate("dashboard.tasks.startedAt", { value: formatDate(task.processing_started_at) })}</p> : null}
        {task.finished_at ? <p>{translate("dashboard.tasks.finishedAt", { value: formatDate(task.finished_at) })}</p> : null}
        {task.queue_wait_seconds != null ? <p>{translate("dashboard.tasks.queueWait", { value: formatElapsed(task.queue_wait_seconds, translate) })}</p> : null}
        {task.processing_seconds != null ? <p>{translate("dashboard.tasks.processingTime", { value: formatElapsed(task.processing_seconds, translate) })}</p> : null}
        {task.total_elapsed_seconds != null ? <p>{translate("dashboard.tasks.totalElapsed", { value: formatElapsed(task.total_elapsed_seconds, translate) })}</p> : null}
        {task.provider_name && <p>{translate("common.provider")}：{task.provider_name}</p>}
        {task.error_message && (
          <p className="text-red-600">
            {translate("common.error")}：{renderTaskError(locale, task.error_message)}
          </p>
        )}
      </div>
      {task.task_type === "long" && task.long_segments && task.long_segments.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3">
            <p className="font-medium text-gray-900">{translate("dashboard.tasks.segmentTasksTitle")}</p>
            <p className="mt-1 text-xs text-gray-500">{translate("dashboard.tasks.segmentTaskHint")}</p>
            {hasFailedLongSegments ? <p className="mt-2 text-xs text-amber-700">{translate("dashboard.tasks.retryHint")}</p> : null}
          </div>
          <div className="space-y-3">
            {task.long_segments.map((segment, index) => (
              <SegmentTaskTreeNode
                key={segment.id}
                index={index}
                segment={segment}
                translate={translate}
                locale={locale}
              />
            ))}
          </div>
        </div>
      ) : null}
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

function buildPendingTaskView(draft: PendingVideoDraft): PendingTaskView {
  return {
    id: draft.id,
    task_type: draft.task_type,
    status: "uploading",
    resolution: draft.resolution,
    aspect_ratio: draft.aspect_ratio,
    duration_seconds: draft.duration_seconds,
    segment_count: draft.task_type === "long" ? draft.segments.length : null,
    planned_quota_consumed: draft.task_type === "long" ? draft.segments.length : 1,
    charged_quota_consumed: 0,
    created_at: draft.created_at,
  };
}

function getUserFacingTaskStatus(task: VideoTask | PendingTaskView): UserFacingTaskStatus {
  if ("queued_at" in task) {
    const hasFailedLongSegments = task.task_type === "long" && !!task.long_segments?.some((segment) => segment.status === "failed");
    if (hasFailedLongSegments) return "failed";
    if (task.status === "queued") return "queued";
    if (task.status === "processing") return "creating";
    if (task.status === "merging") return task.task_type === "long" ? "post_processing" : "creating";
    if (task.status === "succeeded") return "completed";
    return "failed";
  }
  return task.status === "uploading" ? "uploading" : "failed";
}

function renderStatus(
  translate: (key: string) => string,
  status: string,
  taskType?: string,
  hasFailedLongSegments = false,
) {
  if (hasFailedLongSegments) return translate("dashboard.tasks.failed");
  if (status === "queued") return translate("dashboard.tasks.queued");
  if (status === "processing") return translate("dashboard.tasks.creating");
  if (status === "merging") {
    if (taskType === "long") return translate("dashboard.tasks.postProcessing");
    return translate("dashboard.tasks.creating");
  }
  if (status === "succeeded") return translate("dashboard.tasks.completed");
  if (status === "failed") return translate("dashboard.tasks.failed");
  return status;
}

function renderPendingTaskStatus(translate: (key: string) => string, status: PendingTaskView["status"]) {
  if (status === "uploading") return translate("dashboard.tasks.uploading");
  return translate("dashboard.tasks.failed");
}

function renderChargeStatus(translate: (key: string) => string, status: string) {
  if (status === "pending") return translate("dashboard.tasks.chargePending");
  if (status === "charged") return translate("dashboard.tasks.chargeCharged");
  if (status === "skipped") return translate("dashboard.tasks.chargeSkipped");
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

function SegmentTaskTreeNode({
  index,
  segment,
  translate,
  locale,
}: {
  index: number;
  segment: LongVideoSegmentStatus;
  translate: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  const isActive = segment.status === "processing";
  const statusClass =
    segment.status === "failed"
      ? "border-red-200 bg-red-50"
      : segment.status === "succeeded"
        ? "border-emerald-200 bg-emerald-50"
        : isActive
          ? "border-blue-200 bg-blue-50"
          : "border-gray-200 bg-white";

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 h-full w-px bg-gray-300" />
      <div className="absolute left-[5px] top-5 h-px w-4 bg-gray-300" />
      <div className={`absolute left-0 top-3 h-4 w-4 rounded-full border ${isActive ? "border-blue-500 bg-blue-100" : "border-gray-300 bg-white"}`} />
      <div className={`rounded-xl border p-3 ${statusClass}`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-gray-900">{translate("dashboard.tasks.segmentTaskLabel", { index: index + 1 })}</p>
              {isActive ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{translate("dashboard.tasks.activeSegment")}</span> : null}
            </div>
            <p className="mt-1 text-sm text-gray-600">{renderSegmentStatus(translate, segment.status)}</p>
          </div>
          <p className="text-sm text-gray-500">{translate("common.duration")}：{translate("common.seconds", { value: segment.duration_seconds })}</p>
        </div>
        {segment.provider_task_id ? (
          <p className="mt-2 break-all text-xs text-gray-500">
            {translate("dashboard.tasks.segmentProviderTaskId", { id: segment.provider_task_id })}
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
          {segment.processing_seconds != null ? <p>{translate("dashboard.tasks.segmentProcessingTime", { value: formatElapsed(segment.processing_seconds, translate) })}</p> : null}
          {segment.total_elapsed_seconds != null ? <p>{translate("dashboard.tasks.segmentTotalElapsed", { value: formatElapsed(segment.total_elapsed_seconds, translate) })}</p> : null}
        </div>
        {segment.error_message ? (
          <p className="mt-2 text-sm text-red-600">
            {translate("common.error")}：{renderTaskError(locale, segment.error_message)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function renderSegmentStatus(translate: (key: string) => string, status: string) {
  if (status === "queued") return translate("dashboard.tasks.queued");
  if (status === "processing") return translate("dashboard.tasks.creating");
  if (status === "succeeded") return translate("dashboard.tasks.completed");
  if (status === "failed") return translate("dashboard.tasks.failed");
  return status;
}

function formatElapsed(value: number, translate: (key: string, params?: Record<string, string | number>) => string) {
  if (value < 60) return translate("common.seconds", { value });
  if (value < 3600) {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    if (seconds === 0) return translate("common.compactDurationMinute", { minutes });
    return translate("common.compactDurationMinuteSecond", { minutes, seconds });
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60);
  const remainingMinutes = minutes % 60;
  const seconds = value % 60;
  return translate("common.compactDurationHourMinuteSecond", {
    hours,
    minutes: remainingMinutes,
    seconds,
  });
}
