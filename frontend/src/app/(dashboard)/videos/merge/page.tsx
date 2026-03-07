"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { type SceneTemplate, type UserLogo } from "@/lib/api";
import { useDashboardSession } from "@/components/providers/session-provider";
import { getAccessTierLabel, hasCapability } from "@/lib/capabilities";
import { getSceneTemplateDisplayName } from "@/lib/locale";
import { createPendingLongVideoDraft } from "@/lib/pending-video-task";
import { getCachedSceneTemplates, getCachedUserLogos } from "@/lib/video-config-cache";

type EditMode = "unified" | "custom";
const ALL_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "adaptive"] as const;

type SegmentDraft = {
  id: string;
  file: File;
  sourceIndex: number;
  sceneTemplateId: string;
  durationSeconds: number;
  previewUrl: string;
};

export default function VideoMergePage() {
  const { accessToken, quota } = useDashboardSession();
  const { translate } = useLocale();
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [segmentTemplates, setSegmentTemplates] = useState<SceneTemplate[]>([]);
  const [unifiedTemplates, setUnifiedTemplates] = useState<SceneTemplate[]>([]);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingStage, setCreatingStage] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [sceneTemplateId, setSceneTemplateId] = useState("");
  const [segmentTemplateSeedId, setSegmentTemplateSeedId] = useState("");
  const resolution = "1080p" as const;
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1" | "adaptive">("16:9");
  const [durationSeconds, setDurationSeconds] = useState(4);
  const [editMode, setEditMode] = useState<EditMode>("unified");
  const [enableLogo, setEnableLogo] = useState(false);
  const [selectedLogoKey, setSelectedLogoKey] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const latestSegmentsRef = useRef<SegmentDraft[]>([]);

  const getTemplateLabel = (template: SceneTemplate) =>
    getSceneTemplateDisplayName(translate, template.template_key, template.name);
  const supportsPerImageTemplate = hasCapability(quota, "merge_per_image_template");
  const supportsPerSegmentDuration = hasCapability(quota, "merge_per_segment_duration");
  const supportsDragReorder = hasCapability(quota, "merge_drag_reorder");
  const supportsTransitionEffect = hasCapability(quota, "transition_effect");
  const supportsAdvancedLongVideo = supportsPerImageTemplate || supportsPerSegmentDuration || supportsDragReorder;
  const canUseCustomMode = supportsAdvancedLongVideo;

  useEffect(() => {
    if (bootstrapped) return;
    Promise.all([
      getCachedSceneTemplates(accessToken, "short"),
      getCachedSceneTemplates(accessToken, "long_unified"),
      getCachedUserLogos(accessToken),
    ])
      .then(([shortTemplateData, unifiedTemplateData, logoData]) => {
        setSegmentTemplates(shortTemplateData);
        setUnifiedTemplates(unifiedTemplateData);
        setLogos(logoData);
        if (!sceneTemplateId && unifiedTemplateData.length > 0) setSceneTemplateId(unifiedTemplateData[0].id);
        if (!segmentTemplateSeedId && shortTemplateData.length > 0) setSegmentTemplateSeedId(shortTemplateData[0].id);
        const defaultLogo = logoData.find((item) => item.is_default) || logoData[0];
        if (!selectedLogoKey && defaultLogo) setSelectedLogoKey(defaultLogo.key);
      })
      .catch((err) => {
        setFormError(err instanceof Error ? err.message : translate("dashboard.longVideo.createFailed"));
      })
      .finally(() => setBootstrapped(true));
  }, [accessToken, bootstrapped, sceneTemplateId, segmentTemplateSeedId, selectedLogoKey, translate]);

  function buildSegmentDraft(file: File, index: number): SegmentDraft {
    return {
      id: `${file.name}-${file.lastModified}-${index}-${crypto.randomUUID()}`,
      file,
      sourceIndex: index,
      sceneTemplateId: segmentTemplateSeedId,
      durationSeconds,
      previewUrl: URL.createObjectURL(file),
    };
  }

  function revokeSegmentUrls(items: SegmentDraft[]) {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }

  function handleFilesSelected(files: File[]) {
    setSegments((current) => {
      revokeSegmentUrls(current);
      return files.map((file, index) => buildSegmentDraft(file, index));
    });
  }

  function updateSegment(id: string, patch: Partial<SegmentDraft>) {
    setSegments((current) => current.map((segment) => (segment.id === id ? { ...segment, ...patch } : segment)));
  }

  function moveSegment(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= segments.length || fromIndex === toIndex) return;
    setSegments((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function applyTemplateToAll() {
    setSegments((current) => current.map((segment) => ({ ...segment, sceneTemplateId: segmentTemplateSeedId })));
  }

  function applyDurationToAll() {
    setSegments((current) => current.map((segment) => ({ ...segment, durationSeconds })));
  }

  useEffect(() => {
    latestSegmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    return () => {
      revokeSegmentUrls(latestSegmentsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canUseCustomMode && editMode !== "unified") {
      setEditMode("unified");
    }
  }, [canUseCustomMode, editMode]);

  useEffect(() => {
    if (!supportsPerImageTemplate) {
      setSegments((current) => current.map((segment) => ({ ...segment, sceneTemplateId })));
    }
  }, [sceneTemplateId, supportsPerImageTemplate]);

  useEffect(() => {
    if (!supportsPerSegmentDuration) {
      setSegments((current) => current.map((segment) => ({ ...segment, durationSeconds })));
    }
  }, [durationSeconds, supportsPerSegmentDuration]);

  useEffect(() => {
    if (editMode === "unified") {
      setSegments((current) =>
        current.map((segment) => ({
          ...segment,
          sceneTemplateId,
          durationSeconds,
        })),
      );
    }
  }, [durationSeconds, editMode, sceneTemplateId]);

  const prevEditModeRef = useRef<EditMode>(editMode);
  useEffect(() => {
    if (prevEditModeRef.current !== "custom" && editMode === "custom" && segmentTemplateSeedId) {
      setSegments((current) =>
        current.map((segment) => ({
          ...segment,
          sceneTemplateId: segmentTemplateSeedId,
        })),
      );
    }
    prevEditModeRef.current = editMode;
  }, [editMode, segmentTemplateSeedId]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (segments.length < 2 || segments.length > 10) {
      setFormError(translate("dashboard.longVideo.invalidImageCount"));
      return;
    }
    if (editMode === "unified" && !sceneTemplateId) {
      setFormError(translate("dashboard.longVideo.chooseTemplateFirst"));
      return;
    }
    if (editMode === "custom" && segments.some((s) => !s.sceneTemplateId)) {
      setFormError(translate("dashboard.longVideo.chooseTemplateFirst"));
      return;
    }
    if (enableLogo && logos.length === 0) {
      setFormError(translate("dashboard.longVideo.noLogoAvailable"));
      return;
    }
    if (enableLogo && !selectedLogoKey) {
      setFormError(translate("dashboard.longVideo.chooseLogoFirst"));
      return;
    }

    setCreating(true);
    setCreatingStage("");
    setFormError("");
    setFormMessage("");
    try {
      const orderedSegments = editMode === "custom" ? segments : [...segments].sort((left, right) => left.sourceIndex - right.sourceIndex);
      const firstSegment = orderedSegments[0];
      const draft = createPendingLongVideoDraft({
        scene_template_id: editMode === "custom" ? firstSegment?.sceneTemplateId || sceneTemplateId : sceneTemplateId,
        resolution,
        aspect_ratio: aspectRatio,
        duration_seconds: editMode === "custom" ? firstSegment?.durationSeconds || durationSeconds : durationSeconds,
        logo_key: enableLogo ? selectedLogoKey : null,
        edit_mode: editMode,
        segments: segments.map((segment) => ({
          id: segment.id,
          file: segment.file,
          source_index: segment.sourceIndex,
          scene_template_id: segment.sceneTemplateId,
          duration_seconds: segment.durationSeconds,
        })),
      });
      router.push(`/videos/tasks?draft=${encodeURIComponent(draft.id)}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : translate("dashboard.longVideo.createFailed"));
    } finally {
      setCreating(false);
      setCreatingStage("");
    }
  }

  if (!bootstrapped) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-500">{translate("dashboard.longVideo.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6">
        <form onSubmit={handleCreateTask} className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.longVideo.createTitle")}</h2>
            </div>
            <div className="space-y-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p>{translate("dashboard.longVideo.totalQuota", { count: quota.total_available })}</p>
              <p>{translate("dashboard.header.currentPermission", { value: getAccessTierLabel(translate, quota.access_tier) })}</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.imagesLabel")}</label>
            <input
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              multiple
              onChange={(e) => handleFilesSelected(Array.from(e.target.files || []))}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {translate("dashboard.longVideo.uploadImage")}
            </button>
            <p className="mt-1 text-xs text-gray-500">
              {segments.length > 0
                ? translate("dashboard.longVideo.imagesSelected", { count: segments.length })
                : translate("dashboard.longVideo.imagesHint")}
            </p>
            {segments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                {segments.map((segment, index) => (
                  <span key={segment.id} className="rounded-full bg-gray-100 px-3 py-1">
                    {index + 1}. {segment.file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.resolutionLabel")}</label>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {translate("common.fixed1080p")}
              </div>
              <p className="mt-1 text-xs text-gray-500">{translate("dashboard.shortVideo.resolutionFixedHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.aspectRatioLabel")}</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as "16:9" | "9:16" | "1:1" | "adaptive")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {ALL_ASPECT_RATIOS.map((value) => (
                  <option key={value} value={value} disabled={!quota.limits.allowed_aspect_ratios.includes(value)}>
                    {quota.limits.allowed_aspect_ratios.includes(value)
                      ? value
                      : `${value} · ${translate("dashboard.shortVideo.unavailableOptionSuffix")}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setEditMode("unified")}
                className={`rounded-2xl border p-4 text-left ${
                  editMode === "unified" ? "border-blue-600 bg-blue-50" : "bg-white hover:bg-gray-50"
                }`}
              >
                <p className="font-medium text-gray-900">{translate("dashboard.longVideo.unifiedModeTitle")}</p>
                <p className="mt-1 text-sm text-gray-600">{translate("dashboard.longVideo.unifiedModeSubtitle")}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (canUseCustomMode) setEditMode("custom");
                }}
                disabled={!canUseCustomMode}
                className={`rounded-2xl border p-4 text-left ${
                  editMode === "custom" && canUseCustomMode
                    ? "border-blue-600 bg-blue-50"
                    : "bg-white hover:bg-gray-50"
                } ${!canUseCustomMode ? "cursor-not-allowed border-gray-200 bg-gray-100 opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-900">{translate("dashboard.longVideo.customModeTitle")}</p>
                  {!canUseCustomMode && (
                    <span className="rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-600">
                      {translate("common.notAvailable")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600">{translate("dashboard.longVideo.customModeSubtitle")}</p>
              </button>
            </div>

            {editMode === "unified" && (
              <div className="rounded-2xl border bg-gray-50 p-4">
                <h4 className="font-medium text-gray-900">{translate("dashboard.longVideo.unifiedModeTitle")}</h4>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.unifiedTemplate")}</label>
                    <select
                      value={sceneTemplateId}
                      onChange={(e) => setSceneTemplateId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {unifiedTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {getTemplateLabel(template)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.unifiedDuration")}</label>
                    <select
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Number(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                        <option key={value} value={value}>
                          {translate("common.seconds", { value })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {editMode === "custom" && (
              <div className={`rounded-2xl border p-4 ${canUseCustomMode ? "bg-gray-50" : "bg-gray-100 opacity-60"}`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{translate("dashboard.longVideo.segmentEditorTitle")}</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={segmentTemplateSeedId}
                      onChange={(e) => setSegmentTemplateSeedId(e.target.value)}
                      disabled={!canUseCustomMode}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                    >
                      {segmentTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {getTemplateLabel(template)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={applyTemplateToAll}
                      disabled={!canUseCustomMode || !segmentTemplateSeedId || segments.length === 0}
                      className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                    >
                      {translate("dashboard.longVideo.applyTemplateToAll")}
                    </button>
                    <button
                      type="button"
                      onClick={applyDurationToAll}
                      disabled={!canUseCustomMode || segments.length === 0}
                      className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                    >
                      {translate("dashboard.longVideo.applyDurationToAll")}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      draggable={canUseCustomMode && supportsDragReorder}
                      onDragStart={() => {
                        if (canUseCustomMode && supportsDragReorder) setDraggingId(segment.id);
                      }}
                      onDragOver={(event) => {
                        if (canUseCustomMode && supportsDragReorder) event.preventDefault();
                      }}
                      onDrop={() => {
                        if (!canUseCustomMode || !supportsDragReorder || !draggingId || draggingId === segment.id) return;
                        const fromIndex = segments.findIndex((item) => item.id === draggingId);
                        moveSegment(fromIndex, index);
                        setDraggingId("");
                      }}
                      onDragEnd={() => setDraggingId("")}
                      className={`rounded-2xl border bg-white p-4 transition ${
                        canUseCustomMode && supportsDragReorder ? "cursor-grab active:cursor-grabbing" : ""
                      } ${draggingId === segment.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <Image
                          src={segment.previewUrl}
                          alt={segment.file.name}
                          width={80}
                          height={80}
                          unoptimized
                          className="h-20 w-20 rounded-xl border object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">
                            {translate("dashboard.longVideo.segmentCardTitle", { index: index + 1 })}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">{segment.file.name}</p>
                          {supportsDragReorder && (
                            <p className="mt-2 text-xs text-blue-600">{translate("dashboard.longVideo.dragHandle")}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.perImageTemplate")}</label>
                          <select
                            value={segment.sceneTemplateId}
                            onChange={(e) => updateSegment(segment.id, { sceneTemplateId: e.target.value })}
                            disabled={!canUseCustomMode || !supportsPerImageTemplate}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                          >
                            {segmentTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {getTemplateLabel(template)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.perSegmentDuration")}</label>
                          <select
                            value={segment.durationSeconds}
                            onChange={(e) => updateSegment(segment.id, { durationSeconds: Number(e.target.value) })}
                            disabled={!canUseCustomMode || !supportsPerSegmentDuration}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                          >
                            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                              <option key={value} value={value}>
                                {translate("common.seconds", { value })}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={enableLogo} onChange={(e) => setEnableLogo(e.target.checked)} />
              {translate("dashboard.shortVideo.addLogo")}
            </label>
            {enableLogo && (
              <div className="mt-3 rounded-xl border bg-gray-50 p-4">
                {logos.length > 0 ? (
                  <>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.chooseUploadedLogo")}</label>
                    <select
                      value={selectedLogoKey}
                      onChange={(e) => setSelectedLogoKey(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {logos.map((logo) => (
                        <option key={logo.key} value={logo.key}>
                          {logo.is_default ? `${logo.name} (${translate("common.default")})` : logo.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-amber-700">{translate("dashboard.longVideo.noLogoAvailable")}</p>
                    <Link href="/account" className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50">
                      {translate("dashboard.shortVideo.goUploadLogo")}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.transitionLabel")}</label>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input type="checkbox" disabled />
              {translate("dashboard.shortVideo.enableTransition")}
              <span className="rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-600">
                {translate("dashboard.billing.transitionPlannedBadge")}
              </span>
              {!supportsTransitionEffect && (
                <span className="rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-600">
                  {translate("common.notAvailable")}
                </span>
              )}
            </label>
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">{translate("dashboard.billing.transitionFeatureDescription")}</p>
            </div>
          </div>

          {creatingStage && <p className="text-sm text-blue-600">{creatingStage}</p>}
          {formMessage && <p className="text-sm text-green-600">{formMessage}</p>}
          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={creating || quota.total_available < Math.max(segments.length, 1)}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? translate("dashboard.longVideo.creating") : translate("dashboard.longVideo.create")}
            </button>
            <Link href="/videos/tasks" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
              {translate("common.backToTasks")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
