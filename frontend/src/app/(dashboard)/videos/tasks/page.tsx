"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import {
  ApiError,
  UnauthorizedError,
  createLongVideoTask,
  createShortVideoTask,
  downloadVideoTask,
  getVideoTasks,
  retryVideoTask,
  uploadVideoAsset,
  type LongVideoSegmentStatus,
  type VideoTask,
} from "@/lib/api";
import { InfoTooltip } from "@/components/ui/field-help";
import { getStoredLocale, translateApiError } from "@/lib/locale";
import { deletePendingVideoDraft, getPendingVideoDraft, savePendingVideoDraft, type PendingVideoDraft, type StoredPendingVideoDraft } from "@/lib/pending-video-task";
import { canRetryVideoTask } from "@/lib/task-retry";

type UserFacingTaskStatus = "uploading" | "queued" | "creating" | "post_processing" | "completed" | "failed";
type TaskFilter = "all" | UserFacingTaskStatus;
type TaskTypeFilter = "all" | "short" | "long";
type PendingTaskView = {
  id: string;
  task_type: "short" | "long";
  service_tier: "standard" | "flex";
  status: "uploading" | "failed";
  resolution: string;
  aspect_ratio: string;
  duration_seconds: number;
  segment_count?: number | null;
  planned_quota_consumed: number;
  charged_quota_consumed: number;
  created_at: string;
  error_code?: string;
  error_detail?: string;
  error_retryable?: boolean | null;
  error_message?: string;
};
type TaskListEntry = { kind: "pending"; task: PendingTaskView } | { kind: "task"; task: VideoTask };

export default function VideoTasksPage() {
  const { accessToken, quota, refreshQuota } = useDashboardSession();
  const { translate } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTaskView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>("all");
  const [downloadingTaskId, setDownloadingTaskId] = useState("");
  const [retryingTaskId, setRetryingTaskId] = useState("");
  const [cancellingPendingTaskId, setCancellingPendingTaskId] = useState("");
  const startedDraftIdsRef = useRef<Set<string>>(new Set());
  const pendingSubmitControllersRef = useRef<Map<string, AbortController>>(new Map());
  const draftIdFromQuery = searchParams.get("draft");

  const isAbortError = useCallback((error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  }, []);

  const hasRunningTask = useMemo(
    () =>
      pendingTasks.some((task) => task.status === "uploading") ||
      tasks.some((task) =>
        ["queued", "processing", "merging", "submitting", "submitted", "provider_processing", "finalizing"].includes(task.status),
      ),
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

  const submitPendingDraft = useCallback(async (draft: StoredPendingVideoDraft) => {
    console.info("[draft-debug]", "pending_submit_started", {
      draftId: draft.id,
      status: draft.status,
      taskType: draft.task_type,
    });
    const controller = new AbortController();
    pendingSubmitControllersRef.current.set(draft.id, controller);
    try {
      await savePendingVideoDraft({ ...draft, status: "submitting" });
      let task: VideoTask;
      if (draft.task_type === "short") {
        const imageUpload = await uploadVideoAsset(accessToken, draft.image_file, "image", { signal: controller.signal });
        console.info("[draft-debug]", "pending_submit_short_upload_done", {
          draftId: draft.id,
          imageKey: imageUpload.key,
        });
        task = await createShortVideoTask(accessToken, {
          image_key: imageUpload.key,
          scene_template_id: draft.scene_template_id,
          resolution: draft.resolution,
          aspect_ratio: draft.aspect_ratio,
          duration_seconds: draft.duration_seconds,
          logo_key: draft.logo_key ?? null,
          logo_position_x: draft.logo_placement?.x ?? null,
          logo_position_y: draft.logo_placement?.y ?? null,
          avatar_key: draft.avatar_key ?? null,
          avatar_position: draft.avatar_position ?? null,
          avatar_position_x: draft.avatar_placement?.x ?? null,
          avatar_position_y: draft.avatar_placement?.y ?? null,
          profile_card_id: draft.profile_card_id ?? null,
          profile_card_options: draft.profile_card_options ?? null,
          service_tier: draft.service_tier,
        }, { signal: controller.signal });
        console.info("[draft-debug]", "pending_submit_short_task_created", {
          draftId: draft.id,
          taskId: task.id,
        });
      } else {
        const uploads = await Promise.all(draft.segments.map((segment) => uploadVideoAsset(accessToken, segment.file, "image", { signal: controller.signal })));
        console.info("[draft-debug]", "pending_submit_long_uploads_done", {
          draftId: draft.id,
          uploadCount: uploads.length,
        });
        const uploadedKeysBySegmentId = new Map(draft.segments.map((segment, index) => [segment.id, uploads[index].key]));
        const originalOrderedImageKeys = [...draft.segments]
          .sort((left, right) => left.source_index - right.source_index)
          .map((segment) => uploadedKeysBySegmentId.get(segment.id) || "");
        const orderedSegments =
          draft.edit_mode === "custom"
            ? draft.segments
            : [...draft.segments].sort((left, right) => left.source_index - right.source_index);
        const firstSegment = orderedSegments[0];
        const longTaskPayload = {
          image_keys: originalOrderedImageKeys,
          scene_template_id: draft.edit_mode === "custom" ? firstSegment?.scene_template_id || draft.scene_template_id : draft.scene_template_id,
          resolution: draft.resolution,
          aspect_ratio: draft.aspect_ratio,
          duration_seconds: draft.edit_mode === "custom" ? firstSegment?.duration_seconds || draft.duration_seconds : draft.duration_seconds,
          logo_key: draft.logo_key ?? null,
          logo_position_x: draft.logo_placement?.x ?? null,
          logo_position_y: draft.logo_placement?.y ?? null,
          avatar_key: draft.avatar_key ?? null,
          avatar_position: draft.avatar_position ?? null,
          avatar_position_x: draft.avatar_placement?.x ?? null,
          avatar_position_y: draft.avatar_placement?.y ?? null,
          profile_card_id: draft.profile_card_id ?? null,
          profile_card_options: draft.profile_card_options ?? null,
          service_tier: draft.service_tier,
          segments:
            draft.edit_mode === "custom"
              ? orderedSegments.map((segment, index) => ({
                  image_key: uploadedKeysBySegmentId.get(segment.id) || "",
                  scene_template_id: segment.scene_template_id,
                  duration_seconds: segment.duration_seconds,
                  sort_order: index,
                }))
              : null,
        };
        console.info("[draft-debug]", "pending_submit_long_payload", {
          draftId: draft.id,
          editMode: draft.edit_mode,
          payload: longTaskPayload,
        });
        task = await createLongVideoTask(accessToken, longTaskPayload, { signal: controller.signal });
        console.info("[draft-debug]", "pending_submit_long_task_created", {
          draftId: draft.id,
          taskId: task.id,
        });
      }

      await deletePendingVideoDraft(draft.id);
      setPendingTasks((current) => current.filter((item) => item.id !== draft.id));
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      router.replace("/videos/tasks");
      await refreshQuota();
      await loadTasks(true);
    } catch (error) {
      console.error("[draft-debug]", "pending_submit_failed", {
        draftId: draft.id,
        error,
        apiError:
          error instanceof ApiError
            ? {
                code: error.code ?? null,
                status: error.status ?? null,
                rawDetail: error.rawDetail ?? null,
                message: error.message,
              }
            : null,
      });
      if (isAbortError(error)) {
        console.info("[draft-debug]", "pending_submit_aborted", { draftId: draft.id });
        await savePendingVideoDraft({ ...draft, status: "editing" });
        setPendingTasks((current) => current.filter((item) => item.id !== draft.id));
        return;
      }
      if (error instanceof UnauthorizedError) {
        await savePendingVideoDraft({ ...draft, status: "auth_required" });
        throw error;
      }
      const isQuotaInsufficient = error instanceof ApiError && error.code === "billing.quota.insufficient";
      if (isQuotaInsufficient) {
        await savePendingVideoDraft({ ...draft, status: "ready" });
      } else {
        await deletePendingVideoDraft(draft.id);
      }
      router.replace("/videos/tasks");
      setPendingTasks((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: "failed",
                error_code: error instanceof ApiError ? error.code : undefined,
                error_detail: error instanceof ApiError && typeof error.rawDetail === "string" ? error.rawDetail : undefined,
                error_retryable: true,
                error_message: error instanceof Error ? error.message : translate("dashboard.tasks.failed"),
              }
            : item,
        ),
      );
    } finally {
      // Allow the same recovered draft ID to be submitted again later if the user
      // returns to editing and retries the submission flow.
      startedDraftIdsRef.current.delete(draft.id);
      pendingSubmitControllersRef.current.delete(draft.id);
      setCancellingPendingTaskId((current) => (current === draft.id ? "" : current));
    }
  }, [accessToken, isAbortError, loadTasks, refreshQuota, router, translate]);

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  useEffect(() => {
    if (!draftIdFromQuery) return;
    const startedDraftIds = startedDraftIdsRef.current;
    if (startedDraftIds.has(draftIdFromQuery)) {
      console.info("[draft-debug]", "tasks_page_draft_skipped_duplicate", { draftId: draftIdFromQuery });
      return;
    }
    console.info("[draft-debug]", "tasks_page_draft_detected", { draftId: draftIdFromQuery });
    let cancelled = false;
    startedDraftIds.add(draftIdFromQuery);
    void getPendingVideoDraft(draftIdFromQuery)
      .then((draft) => {
        if (cancelled) {
          console.info("[draft-debug]", "tasks_page_draft_load_cancelled", { draftId: draftIdFromQuery });
          startedDraftIds.delete(draftIdFromQuery);
          return;
        }
        if (!draft) {
          console.warn("[draft-debug]", "tasks_page_draft_missing", { draftId: draftIdFromQuery });
          startedDraftIds.delete(draftIdFromQuery);
          router.replace("/videos/tasks");
          return;
        }
        console.info("[draft-debug]", "tasks_page_draft_loaded", {
          draftId: draft.id,
          status: draft.status,
          taskType: draft.task_type,
        });
        setPendingTasks((current) => (current.some((item) => item.id === draft.id) ? current : [buildPendingTaskView(draft), ...current]));
        void submitPendingDraft(draft).catch(() => {
          // Redirect and UI state are handled inside auth/api and submitPendingDraft.
        });
      })
      .catch((error) => {
        console.error("[draft-debug]", "tasks_page_draft_load_failed", {
          draftId: draftIdFromQuery,
          error,
        });
        startedDraftIds.delete(draftIdFromQuery);
      });
    return () => {
      cancelled = true;
      startedDraftIds.delete(draftIdFromQuery);
    };
  }, [draftIdFromQuery, router, submitPendingDraft]);

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

  function handleCancelPendingTask(taskId: string) {
    setCancellingPendingTaskId(taskId);
    pendingSubmitControllersRef.current.get(taskId)?.abort();
  }

  async function handlePurchaseQuotaForDraft(task: PendingTaskView) {
    const draft = await getPendingVideoDraft(task.id);
    if (draft) {
      await savePendingVideoDraft({ ...draft, status: "ready" });
    }
    const params = new URLSearchParams({
      returnTo: `/videos/tasks?draft=${encodeURIComponent(task.id)}`,
      resumeMode: "submit",
      taskType: task.task_type,
      draft: task.id,
    });
    router.push(`/billing?${params.toString()}`);
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
            <PendingTaskCard
              key={entry.task.id}
              task={entry.task}
              translate={translate}
              cancellingTaskId={cancellingPendingTaskId}
              canPurchaseQuotaPackage={quota.can_purchase_quota_package}
              onCancel={handleCancelPendingTask}
              onPurchaseQuota={handlePurchaseQuotaForDraft}
            />
          ) : (
            <TaskCard
              key={entry.task.id}
              task={entry.task}
              downloadingTaskId={downloadingTaskId}
              retryingTaskId={retryingTaskId}
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
  translate,
  cancellingTaskId,
  canPurchaseQuotaPackage,
  onCancel,
  onPurchaseQuota,
}: {
  task: PendingTaskView;
  translate: (key: string, params?: Record<string, string | number>) => string;
  cancellingTaskId: string;
  canPurchaseQuotaPackage: boolean;
  onCancel: (taskId: string) => void;
  onPurchaseQuota: (task: PendingTaskView) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium text-gray-900">{renderPendingTaskStatus(translate, task.status)}</p>
            {isPendingTaskRunning(task.status) ? <RunningStatusIndicator /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <p>{translate("dashboard.tasks.taskType", { value: renderTaskType(translate, task.task_type) })}</p>
            {renderServiceTierBadge(translate, task.service_tier)}
          </div>
          <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.tasks.taskId", { id: task.id })}</p>
        </div>
        {task.status === "uploading" ? (
          <button
            type="button"
            onClick={() => onCancel(task.id)}
            disabled={cancellingTaskId === task.id}
            className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancellingTaskId === task.id ? translate("common.cancelling") : translate("common.cancel")}
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 text-xs text-gray-600 md:grid-cols-2">
        <p>{translate("dashboard.tasks.creditUsage", { charged: task.charged_quota_consumed, planned: task.planned_quota_consumed })}</p>
        <p>{translate("dashboard.tasks.chargeStatusLabel", { value: translate("dashboard.tasks.chargePending") })}</p>
        <TaskErrorBlock translate={translate} errorCode={task.error_code} errorMessage={task.error_message} />
      </div>
      {task.status === "failed" && task.error_code === "billing.quota.insufficient" && canPurchaseQuotaPackage ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void onPurchaseQuota(task)}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
          >
            {translate("dashboard.billing.buyQuotaPackageAndReturn")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  downloadingTaskId,
  retryingTaskId,
  translate,
  onDownload,
  onRetry,
}: {
  task: VideoTask;
  downloadingTaskId: string;
  retryingTaskId: string;
  translate: (key: string, params?: Record<string, string | number>) => string;
  onDownload: (task: VideoTask) => Promise<void>;
  onRetry: (task: VideoTask) => Promise<void>;
}) {
  const hasFailedLongSegments = task.task_type === "long" && !!task.long_segments?.some((segment) => segment.status === "failed");
  const canRetry = canRetryVideoTask(task);

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium text-gray-900">{renderStatus(translate, task.status, task.task_type, hasFailedLongSegments)}</p>
            {isTaskRunning(task.status, task.task_type, hasFailedLongSegments) ? <RunningStatusIndicator /> : null}
            {renderServiceTierBadge(translate, task.service_tier)}
          </div>
          <p className="mt-1 text-sm text-gray-600">{translate("dashboard.tasks.taskType", { value: renderTaskType(translate, task.task_type) })}</p>
          <p className="mt-1 break-all text-xs text-gray-500">{translate("dashboard.tasks.taskId", { id: task.id })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
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
      <div className="mt-4 grid gap-2 text-xs text-gray-600 md:grid-cols-2">
        <p>{translate("dashboard.tasks.creditUsage", { charged: task.charged_quota_consumed, planned: task.planned_quota_consumed })}</p>
        <p>{translate("dashboard.tasks.chargeStatusLabel", { value: renderChargeStatus(translate, task.charge_status) })}</p>
        {task.processing_seconds != null ? <p>{translate("dashboard.tasks.processingTime", { value: formatElapsed(task.processing_seconds, translate) })}</p> : null}
        <TaskErrorBlock translate={translate} errorCode={task.error_code} errorMessage={task.error_message} />
      </div>
      {task.service_tier === "flex" && task.status !== "succeeded" && task.status !== "failed" ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {translate("dashboard.tasks.flexTaskHint")}
        </div>
      ) : null}
      {task.task_type === "long" && task.long_segments && task.long_segments.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{translate("dashboard.tasks.segmentTasksTitle")}</p>
              <InfoTooltip
                text={`${translate("dashboard.tasks.segmentTaskHint")} ${translate("dashboard.tasks.retryHint")}`}
                ariaLabel={translate("dashboard.tasks.segmentTaskHelpAriaLabel")}
              />
            </div>
          </div>
          <div className="space-y-3">
            {task.long_segments.map((segment, index) => (
              <SegmentTaskTreeNode
                key={segment.id}
                index={index}
                segment={segment}
                translate={translate}
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
    service_tier: draft.service_tier,
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
    if (["processing", "submitting", "submitted", "provider_processing"].includes(task.status)) return "creating";
    if (task.status === "merging" || task.status === "finalizing") return task.task_type === "long" ? "post_processing" : "creating";
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
  if (["processing", "submitting", "submitted", "provider_processing"].includes(status)) return translate("dashboard.tasks.creating");
  if (status === "merging" || status === "finalizing") {
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

function isPendingTaskRunning(status: PendingTaskView["status"]) {
  return status === "uploading";
}

function isTaskRunning(status: string, taskType?: string, hasFailedLongSegments = false) {
  if (hasFailedLongSegments) return false;
  if (status === "queued") return true;
  if (["processing", "submitting", "submitted", "provider_processing"].includes(status)) return true;
  if (status === "merging" || status === "finalizing") {
    return taskType === "long" || taskType === "short";
  }
  return false;
}

function RunningStatusIndicator() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-end gap-1 rounded-full border border-blue-200/80 bg-blue-50/80 px-2 py-1"
    >
      <span className="h-2 w-1 animate-pulse rounded-full bg-blue-500" />
      <span className="h-3 w-1 animate-pulse rounded-full bg-blue-500 [animation-delay:120ms]" />
      <span className="h-2.5 w-1 animate-pulse rounded-full bg-blue-500 [animation-delay:240ms]" />
    </span>
  );
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

function renderServiceTierBadge(
  translate: (key: string) => string,
  serviceTier: "standard" | "flex",
) {
  if (serviceTier !== "flex") return null;
  return <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{translate("dashboard.tasks.flexBadge")}</span>;
}

function resolveTaskErrorDisplay(
  errorCode?: string | null,
  errorMessage?: string | null,
) {
  const locale = getStoredLocale();
  const translatedCode = errorCode ? translateApiError(errorCode, locale) : undefined;
  const translatedMessageCode =
    errorMessage && errorMessage.includes(".") ? translateApiError(errorMessage, locale) : undefined;
  const title = translatedCode ?? translatedMessageCode ?? errorMessage ?? errorCode ?? "";
  return { title };
}

function TaskErrorBlock({
  translate,
  errorCode,
  errorMessage,
}: {
  translate: (key: string, params?: Record<string, string | number>) => string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!errorCode && !errorMessage) {
    return null;
  }
  const { title } = resolveTaskErrorDisplay(errorCode, errorMessage);
  return (
    <div className="text-xs text-red-600">
      <p className="break-all">
        {translate("common.error")}：{title || translate("common.requestFailed")}
      </p>
    </div>
  );
}

function SegmentTaskTreeNode({
  index,
  segment,
  translate,
}: {
  index: number;
  segment: LongVideoSegmentStatus;
  translate: (key: string, params?: Record<string, string | number>) => string;
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
              <p className="text-sm font-medium text-gray-900">{translate("dashboard.tasks.segmentTaskLabel", { index: index + 1 })}</p>
              {isActive ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{translate("dashboard.tasks.activeSegment")}</span> : null}
            </div>
          </div>
          <p className="text-xs text-gray-500">{translate("common.duration")}：{translate("common.seconds", { value: segment.duration_seconds })}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
          <p>{renderSegmentStatus(translate, segment.status)}</p>
          {segment.processing_seconds != null ? <p>{translate("dashboard.tasks.segmentProcessingTime", { value: formatElapsed(segment.processing_seconds, translate) })}</p> : null}
          {segment.error_code || segment.error_message ? (
            <TaskErrorInline translate={translate} errorCode={segment.error_code} errorMessage={segment.error_message} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskErrorInline({
  translate,
  errorCode,
  errorMessage,
}: {
  translate: (key: string, params?: Record<string, string | number>) => string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { title } = resolveTaskErrorDisplay(errorCode, errorMessage);
  return <p className="break-all text-[11px] text-red-600">{translate("common.error")}：{title || translate("common.requestFailed")}</p>;
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
