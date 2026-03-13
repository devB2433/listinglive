"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { InfoTooltip, PlanBadge } from "@/components/ui/field-help";
import {
  type AvatarPosition,
  ensureSessionReady,
  getAvatarPreviewBlob,
  getLogoPreviewBlob,
  type OverlayPlacement,
  type ProfileCard,
  type SceneTemplate,
  type SceneTemplatePropertyType,
  UnauthorizedError,
  type UserAvatar,
  type UserLogo,
} from "@/lib/api";
import { useDashboardSession } from "@/components/providers/session-provider";
import { hasCapability } from "@/lib/capabilities";
import { getSceneTemplateDisplayName } from "@/lib/locale";
import {
  clearActivePendingVideoDraft,
  createPendingLongVideoDraft,
  deletePendingVideoDraft,
  getActivePendingVideoDraft,
  savePendingVideoDraft,
  type PendingVideoDraftStatus,
  type StoredPendingVideoDraft,
} from "@/lib/pending-video-task";
import { getCachedProfileCards, getCachedSceneTemplates, getCachedUserAvatars, getCachedUserLogos } from "@/lib/video-config-cache";

type EditMode = "unified" | "custom";
const PROPERTY_TYPE_OPTIONS: SceneTemplatePropertyType[] = ["standard_home", "luxury_home", "apartment_rental"];
const AVATAR_POSITIONS: AvatarPosition[] = ["top_left", "top_right", "bottom_left", "bottom_right"];
const CORNER_PLACEMENTS: Record<AvatarPosition, OverlayPlacement> = {
  top_left: { x: 0, y: 0 },
  top_right: { x: 1, y: 0 },
  bottom_left: { x: 0, y: 1 },
  bottom_right: { x: 1, y: 1 },
};
const OVERLAY_PREVIEW_MARGIN_PX = 12;
const OVERLAY_SNAP_THRESHOLD_PX = 48;
const AVATAR_PREVIEW_WIDTH_EXPR = "clamp(36px, 9%, 88px)";
const LOGO_PREVIEW_WIDTH_EXPR = "clamp(64px, 15%, 140px)";
const LONG_DRAFT_SCOPE = "long_merge" as const;
type WizardStep = 1 | 2 | 3;
type OverlayEditorTarget = "logo" | "avatar" | null;

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
  const stepContentRef = useRef<HTMLDivElement | null>(null);
  const submitAbortControllerRef = useRef<AbortController | null>(null);
  const [segmentTemplates, setSegmentTemplates] = useState<SceneTemplate[]>([]);
  const [unifiedTemplates, setUnifiedTemplates] = useState<SceneTemplate[]>([]);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [avatars, setAvatars] = useState<UserAvatar[]>([]);
  const [profileCards, setProfileCards] = useState<ProfileCard[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingStage, setCreatingStage] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [editorDraftId, setEditorDraftId] = useState("");
  const [recoveryDraft, setRecoveryDraft] = useState<StoredPendingVideoDraft | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const suspendDraftAutosaveRef = useRef(false);
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [sceneTemplateId, setSceneTemplateId] = useState("");
  const [segmentTemplateSeedId, setSegmentTemplateSeedId] = useState("");
  const [propertyType, setPropertyType] = useState<SceneTemplatePropertyType>("standard_home");
  const resolution = "1080p" as const;
  const aspectRatio = "16:9" as const;
  const [durationSeconds, setDurationSeconds] = useState(4);
  const [editMode, setEditMode] = useState<EditMode>("unified");
  const [enableLogo, setEnableLogo] = useState(false);
  const [selectedLogoKey, setSelectedLogoKey] = useState("");
  const [logoPlacement, setLogoPlacement] = useState<OverlayPlacement>(CORNER_PLACEMENTS.bottom_right);
  const [enableAvatar, setEnableAvatar] = useState(false);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState("");
  const [avatarPosition, setAvatarPosition] = useState<AvatarPosition>("bottom_right");
  const [avatarPlacement, setAvatarPlacement] = useState<OverlayPlacement>(CORNER_PLACEMENTS.bottom_right);
  const [enableProfileCard, setEnableProfileCard] = useState(false);
  const [selectedProfileCardId, setSelectedProfileCardId] = useState("");
  const [editingOverlayTarget, setEditingOverlayTarget] = useState<OverlayEditorTarget>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoPreviewLoading, setLogoPreviewLoading] = useState(false);
  const [logoPreviewAspectRatio, setLogoPreviewAspectRatio] = useState(3);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [logoDragCoords, setLogoDragCoords] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [logoSnapTarget, setLogoSnapTarget] = useState<AvatarPosition>("bottom_right");
  const [logoMagnetTarget, setLogoMagnetTarget] = useState<AvatarPosition | null>("bottom_right");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarPreviewLoading, setAvatarPreviewLoading] = useState(false);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [avatarDragCoords, setAvatarDragCoords] = useState<{ x: number; y: number; size: number } | null>(null);
  const [avatarSnapTarget, setAvatarSnapTarget] = useState<AvatarPosition>("bottom_right");
  const [avatarMagnetTarget, setAvatarMagnetTarget] = useState<AvatarPosition | null>("bottom_right");
  const [draggingId, setDraggingId] = useState("");
  const latestSegmentsRef = useRef<SegmentDraft[]>([]);
  const logoPreviewUrlRef = useRef("");
  const overlayPreviewStageRef = useRef<HTMLDivElement | null>(null);
  const logoDragCleanupRef = useRef<(() => void) | null>(null);
  const avatarPreviewUrlRef = useRef("");
  const avatarDragCleanupRef = useRef<(() => void) | null>(null);

  const getTemplateLabel = (template: SceneTemplate) =>
    getSceneTemplateDisplayName(translate, template.template_key, template.name);
  const wizardSteps = [
    {
      id: 1 as const,
      title: translate("dashboard.longVideo.wizardStepUploadTitle"),
      description: translate("dashboard.longVideo.wizardStepUploadDescription"),
    },
    {
      id: 2 as const,
      title: translate("dashboard.longVideo.wizardStepStyleTitle"),
      description: translate("dashboard.longVideo.wizardStepStyleDescription"),
    },
    {
      id: 3 as const,
      title: translate("dashboard.longVideo.wizardStepBrandingTitle"),
      description: translate("dashboard.longVideo.wizardStepBrandingDescription"),
    },
  ];
  const supportsPerImageTemplate = hasCapability(quota, "merge_per_image_template");
  const supportsPerSegmentDuration = hasCapability(quota, "merge_per_segment_duration");
  const supportsDragReorder = hasCapability(quota, "merge_drag_reorder");
  const supportsTransitionEffect = hasCapability(quota, "transition_effect");
  const supportsLogoPositionCustomize = hasCapability(quota, "logo_position_customize");
  const supportsAvatarOverlay = hasCapability(quota, "avatar_overlay");
  const supportsEndingProfileCard = hasCapability(quota, "ending_profile_card");
  const supportsAdvancedLongVideo = supportsPerImageTemplate || supportsPerSegmentDuration || supportsDragReorder;
  const canUseCustomMode = supportsAdvancedLongVideo;
  const selectedLogo = logos.find((logo) => logo.key === selectedLogoKey) || null;
  const selectedAvatar = avatars.find((avatar) => avatar.key === selectedAvatarKey) || null;
  const canEditLogoPlacement = enableLogo && !!selectedLogo && supportsLogoPositionCustomize;
  const canEditAvatarPlacement = enableAvatar && !!selectedAvatar && supportsAvatarOverlay;
  const effectiveLogoPlacement = supportsLogoPositionCustomize ? logoPlacement : CORNER_PLACEMENTS.bottom_right;
  const previewBackgroundUrl = segments[0]?.previewUrl || "";
  const currentOverlayPlacement =
    editingOverlayTarget === "avatar" ? avatarPlacement : editingOverlayTarget === "logo" ? effectiveLogoPlacement : null;
  const currentOverlayPlacementLabel =
    editingOverlayTarget === "avatar"
      ? formatOverlayPlacementSummary(translate, avatarPlacement, avatarSnapTarget)
      : editingOverlayTarget === "logo"
        ? formatOverlayPlacementSummary(translate, effectiveLogoPlacement, logoSnapTarget)
        : null;
  const currentOverlayMagnetTarget =
    editingOverlayTarget === "avatar" ? avatarMagnetTarget : editingOverlayTarget === "logo" ? logoMagnetTarget : null;
  const currentOverlayNearestTarget =
    editingOverlayTarget === "avatar" ? avatarSnapTarget : editingOverlayTarget === "logo" ? logoSnapTarget : "bottom_right";
  const canEditCurrentOverlay =
    editingOverlayTarget === "avatar" ? canEditAvatarPlacement : editingOverlayTarget === "logo" ? canEditLogoPlacement : false;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCachedSceneTemplates(accessToken, "short", { propertyType }),
      getCachedSceneTemplates(accessToken, "long_unified", { propertyType }),
      getCachedUserLogos(accessToken),
      getCachedUserAvatars(accessToken),
      getCachedProfileCards(accessToken),
    ])
      .then(([shortTemplateData, unifiedTemplateData, logoData, avatarData, profileCardData]) => {
        if (cancelled) return;
        setSegmentTemplates(shortTemplateData);
        setUnifiedTemplates(unifiedTemplateData);
        setLogos(logoData);
        setAvatars(avatarData);
        setProfileCards(profileCardData);
        const defaultLogo = logoData.find((item) => item.is_default) || logoData[0];
        const defaultAvatar = avatarData.find((item) => item.is_default) || avatarData[0];
        const defaultProfileCard = profileCardData.find((item) => item.is_default) || profileCardData[0];
        const fallbackUnifiedTemplateId = unifiedTemplateData[0]?.id ?? "";
        const fallbackSegmentTemplateId = shortTemplateData[0]?.id ?? "";
        setSceneTemplateId((current) =>
          current && unifiedTemplateData.some((template) => template.id === current) ? current : fallbackUnifiedTemplateId,
        );
        setSegmentTemplateSeedId((current) =>
          current && shortTemplateData.some((template) => template.id === current) ? current : fallbackSegmentTemplateId,
        );
        setSegments((current) =>
          current.map((segment) => ({
            ...segment,
            sceneTemplateId: shortTemplateData.some((template) => template.id === segment.sceneTemplateId)
              ? segment.sceneTemplateId
              : fallbackSegmentTemplateId,
          })),
        );
        setSelectedLogoKey((current) =>
          current && logoData.some((logo) => logo.key === current) ? current : (defaultLogo?.key ?? ""),
        );
        setSelectedAvatarKey((current) =>
          current && avatarData.some((avatar) => avatar.key === current) ? current : (defaultAvatar?.key ?? ""),
        );
        setSelectedProfileCardId((current) =>
          current && profileCardData.some((card) => card.id === current) ? current : (defaultProfileCard?.id ?? ""),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setFormError(err instanceof Error ? err.message : translate("dashboard.longVideo.createFailed"));
      })
      .finally(() => setBootstrapped(true));
    return () => {
      cancelled = true;
    };
  }, [accessToken, propertyType, translate]);

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

function withSequentialSourceIndexes(items: SegmentDraft[]) {
  return items.map((segment, index) => ({ ...segment, sourceIndex: index }));
}

function buildSegmentFileKey(file: File) {
  return `${file.name.toLowerCase()}__${file.size}__${file.lastModified}`;
}

  function handleFilesSelected(files: File[]) {
    if (files.length === 0) {
      return;
    }
    const current = latestSegmentsRef.current;
    const seenKeys = new Set(current.map((segment) => buildSegmentFileKey(segment.file)));
    const uniqueFiles: File[] = [];
    let skippedCount = 0;

    files.forEach((file) => {
      const key = buildSegmentFileKey(file);
      if (seenKeys.has(key)) {
        skippedCount += 1;
        return;
      }
      seenKeys.add(key);
      uniqueFiles.push(file);
    });

    if (uniqueFiles.length === 0) {
      setFormMessage(translate("dashboard.longVideo.duplicateImagesSkipped", { count: skippedCount }));
      return;
    }

    const appended = uniqueFiles.map((file, index) => buildSegmentDraft(file, current.length + index));
    setSegments(withSequentialSourceIndexes([...current, ...appended]));

    if (skippedCount > 0) {
      setFormMessage(translate("dashboard.longVideo.duplicateImagesSkipped", { count: skippedCount }));
    }
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
      return withSequentialSourceIndexes(next);
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
    if (!bootstrapped) return;
    stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bootstrapped, step]);

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

  useEffect(() => {
    setLogoSnapTarget(resolveOverlaySnapTargetByPlacement(logoPlacement));
    setLogoMagnetTarget(getPlacementCornerTarget(logoPlacement));
  }, [logoPlacement]);

  useEffect(() => {
    setAvatarSnapTarget(resolveOverlaySnapTargetByPlacement(avatarPlacement));
    setAvatarMagnetTarget(getPlacementCornerTarget(avatarPlacement));
  }, [avatarPlacement]);

  useEffect(() => {
    if (!supportsLogoPositionCustomize) {
      setLogoPlacement(CORNER_PLACEMENTS.bottom_right);
    }
  }, [supportsLogoPositionCustomize]);

  useEffect(() => {
    if (!supportsAvatarOverlay) {
      setEnableAvatar(false);
      setSelectedAvatarKey("");
    }
  }, [supportsAvatarOverlay]);

  useEffect(() => {
    if (!supportsEndingProfileCard) {
      setEnableProfileCard(false);
      setSelectedProfileCardId("");
    }
  }, [supportsEndingProfileCard]);

  useEffect(() => {
    if (canEditLogoPlacement) {
      setEditingOverlayTarget((current) => (current === "avatar" || current === "logo" ? current : "logo"));
      return;
    }
    if (canEditAvatarPlacement) {
      setEditingOverlayTarget((current) => current ?? "avatar");
      return;
    }
    setEditingOverlayTarget(null);
  }, [canEditAvatarPlacement, canEditLogoPlacement]);

  useEffect(() => {
    if (editingOverlayTarget === "avatar" && !canEditAvatarPlacement) {
      setEditingOverlayTarget(canEditLogoPlacement ? "logo" : null);
    } else if (editingOverlayTarget === "logo" && !canEditLogoPlacement) {
      setEditingOverlayTarget(canEditAvatarPlacement ? "avatar" : null);
    }
  }, [canEditAvatarPlacement, canEditLogoPlacement, editingOverlayTarget]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrlRef.current) {
        URL.revokeObjectURL(logoPreviewUrlRef.current);
      }
      logoDragCleanupRef.current?.();
      if (avatarPreviewUrlRef.current) {
        URL.revokeObjectURL(avatarPreviewUrlRef.current);
      }
      avatarDragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!enableLogo || !selectedLogo) {
      if (logoPreviewUrlRef.current) {
        URL.revokeObjectURL(logoPreviewUrlRef.current);
        logoPreviewUrlRef.current = "";
      }
      setLogoPreviewUrl("");
      setLogoPreviewLoading(false);
      return () => {
        active = false;
      };
    }
    setLogoPreviewLoading(true);
    void getLogoPreviewBlob(accessToken, selectedLogo.id)
      .then(async (blob) => {
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        const nextAspectRatio = await readImageAspectRatio(nextUrl);
        if (!active) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        if (logoPreviewUrlRef.current) {
          URL.revokeObjectURL(logoPreviewUrlRef.current);
        }
        logoPreviewUrlRef.current = nextUrl;
        setLogoPreviewUrl(nextUrl);
        setLogoPreviewAspectRatio(nextAspectRatio > 0 ? nextAspectRatio : 3);
      })
      .catch(() => {
        if (!active) return;
        if (logoPreviewUrlRef.current) {
          URL.revokeObjectURL(logoPreviewUrlRef.current);
          logoPreviewUrlRef.current = "";
        }
        setLogoPreviewUrl("");
      })
      .finally(() => {
        if (active) {
          setLogoPreviewLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken, enableLogo, selectedLogo]);

  useEffect(() => {
    let active = true;
    if (!enableAvatar || !selectedAvatar) {
      if (avatarPreviewUrlRef.current) {
        URL.revokeObjectURL(avatarPreviewUrlRef.current);
        avatarPreviewUrlRef.current = "";
      }
      setAvatarPreviewUrl("");
      setAvatarPreviewLoading(false);
      return () => {
        active = false;
      };
    }
    setAvatarPreviewLoading(true);
    void getAvatarPreviewBlob(accessToken, selectedAvatar.id)
      .then((blob) => {
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        if (avatarPreviewUrlRef.current) {
          URL.revokeObjectURL(avatarPreviewUrlRef.current);
        }
        avatarPreviewUrlRef.current = nextUrl;
        setAvatarPreviewUrl(nextUrl);
      })
      .catch(() => {
        if (!active) return;
        if (avatarPreviewUrlRef.current) {
          URL.revokeObjectURL(avatarPreviewUrlRef.current);
          avatarPreviewUrlRef.current = "";
        }
        setAvatarPreviewUrl("");
      })
      .finally(() => {
        if (active) {
          setAvatarPreviewLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken, enableAvatar, selectedAvatar]);

  function clearMessages() {
    setFormError("");
    setFormMessage("");
  }

  function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
  }

  function inferLongDraftStep(draft: StoredPendingVideoDraft): WizardStep {
    if (draft.task_type !== "long") {
      return 1;
    }
    if (draft.wizard_step && draft.wizard_step >= 1 && draft.wizard_step <= 3) {
      return draft.wizard_step;
    }
    if (draft.logo_key || draft.avatar_key || draft.profile_card_id) {
      return 3;
    }
    if (draft.scene_template_id || draft.segments.some((segment) => Boolean(segment.scene_template_id))) {
      return 2;
    }
    return 1;
  }

  const restoreDraftIntoEditor = useCallback(
    (draft: StoredPendingVideoDraft) => {
      if (draft.task_type !== "long") {
        return;
      }
      revokeSegmentUrls(latestSegmentsRef.current);
      setEditorDraftId(draft.id);
      setPropertyType(draft.property_type);
      setSceneTemplateId(draft.scene_template_id);
      setSegmentTemplateSeedId(draft.segment_template_seed_id);
      setDurationSeconds(draft.duration_seconds);
      setEditMode(draft.edit_mode);
      setSegments(
        withSequentialSourceIndexes(
          draft.segments.map((segment) => ({
            id: segment.id,
            file: segment.file,
            sourceIndex: segment.source_index,
            sceneTemplateId: segment.scene_template_id,
            durationSeconds: segment.duration_seconds,
            previewUrl: URL.createObjectURL(segment.file),
          })),
        ),
      );
      setEnableLogo(Boolean(draft.logo_key));
      if (draft.logo_key) {
        setSelectedLogoKey(draft.logo_key);
      }
      setLogoPlacement(draft.logo_placement ?? CORNER_PLACEMENTS.bottom_right);
      setEnableAvatar(Boolean(draft.avatar_key));
      if (draft.avatar_key) {
        setSelectedAvatarKey(draft.avatar_key);
      }
      const restoredAvatarPosition = draft.avatar_position ?? resolveOverlaySnapTargetByPlacement(draft.avatar_placement ?? CORNER_PLACEMENTS.bottom_right);
      setAvatarPosition(restoredAvatarPosition);
      setAvatarPlacement(draft.avatar_placement ?? CORNER_PLACEMENTS[restoredAvatarPosition]);
      setEnableProfileCard(Boolean(draft.profile_card_id));
      if (draft.profile_card_id) {
        setSelectedProfileCardId(draft.profile_card_id);
      }
      setEditingOverlayTarget(null);
      setStep(inferLongDraftStep(draft));
      suspendDraftAutosaveRef.current = false;
    },
    [],
  );

  const buildCurrentDraft = useCallback(
    (status: PendingVideoDraftStatus) => {
      if (segments.length === 0) {
        return null;
      }
      return createPendingLongVideoDraft(
        {
          property_type: propertyType,
          wizard_step: step,
          scene_template_id: sceneTemplateId,
          segment_template_seed_id: segmentTemplateSeedId,
          resolution,
          aspect_ratio: aspectRatio,
          duration_seconds: durationSeconds,
          logo_key: enableLogo ? selectedLogoKey : null,
          logo_placement: enableLogo ? (supportsLogoPositionCustomize ? logoPlacement : CORNER_PLACEMENTS.bottom_right) : null,
          avatar_key: enableAvatar && supportsAvatarOverlay ? selectedAvatarKey : null,
          avatar_position: enableAvatar && supportsAvatarOverlay ? avatarPosition : null,
          avatar_placement: enableAvatar && supportsAvatarOverlay ? avatarPlacement : null,
          profile_card_id: enableProfileCard && supportsEndingProfileCard ? selectedProfileCardId : null,
          profile_card_options: enableProfileCard && supportsEndingProfileCard
            ? {
                include_avatar: true,
                include_name: true,
                include_phone: true,
                include_address: true,
                include_brokerage_name: true,
                include_logo: true,
              }
            : null,
          service_tier: "standard",
          edit_mode: editMode,
          segments: segments.map((segment, index) => ({
            id: segment.id,
            file: segment.file,
            source_index: index,
            scene_template_id: segment.sceneTemplateId,
            duration_seconds: segment.durationSeconds,
          })),
        },
        {
          id: editorDraftId || undefined,
          scope: LONG_DRAFT_SCOPE,
          status,
        },
      );
    },
    [
      aspectRatio,
      avatarPlacement,
      avatarPosition,
      durationSeconds,
      editMode,
      editorDraftId,
      enableAvatar,
      enableLogo,
      enableProfileCard,
      logoPlacement,
      propertyType,
      resolution,
      sceneTemplateId,
      segmentTemplateSeedId,
      segments,
      selectedAvatarKey,
      selectedLogoKey,
      selectedProfileCardId,
      step,
      supportsAvatarOverlay,
      supportsEndingProfileCard,
      supportsLogoPositionCustomize,
    ],
  );

  const persistCurrentDraft = useCallback(
    async (status: PendingVideoDraftStatus) => {
      const draft = buildCurrentDraft(status);
      if (!draft) {
        return null;
      }
      const savedDraft = await savePendingVideoDraft(draft);
      setEditorDraftId(savedDraft.id);
      return savedDraft;
    },
    [buildCurrentDraft],
  );

  const queueDraftForSubmission = useCallback(
    async (sourceDraft?: StoredPendingVideoDraft | null, signal?: AbortSignal) => {
      const baseDraft =
        sourceDraft && sourceDraft.task_type === "long"
          ? await savePendingVideoDraft({ ...sourceDraft, status: "auth_required" })
          : await persistCurrentDraft("auth_required");
      if (!baseDraft) {
        throw new Error(translate("dashboard.longVideo.invalidImageCount"));
      }
      setEditorDraftId(baseDraft.id);

      try {
        await ensureSessionReady(accessToken, { signal });
        const readyDraft = await savePendingVideoDraft({ ...baseDraft, status: "ready" });
        suspendDraftAutosaveRef.current = true;
        setRecoveryDraft(null);
        setEditorDraftId(readyDraft.id);
        router.push(`/videos/tasks?draft=${encodeURIComponent(readyDraft.id)}`);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          suspendDraftAutosaveRef.current = false;
          const authRequiredDraft = await savePendingVideoDraft({ ...baseDraft, status: "auth_required" });
          setRecoveryDraft(authRequiredDraft);
          return;
        }
        suspendDraftAutosaveRef.current = false;
        throw error;
      }
    },
    [accessToken, persistCurrentDraft, router, translate],
  );

  useEffect(() => {
    let cancelled = false;
    void getActivePendingVideoDraft(LONG_DRAFT_SCOPE)
      .then((draft) => {
        if (cancelled) {
          return;
        }
        setRecoveryDraft(draft && draft.task_type === "long" ? draft : null);
      })
      .finally(() => {
        if (!cancelled) {
          setRecoveryChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bootstrapped || !recoveryChecked || creating || segments.length === 0 || suspendDraftAutosaveRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistCurrentDraft("editing").catch(() => {
        // Keep autosave best-effort so editing continues even if storage is unavailable.
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bootstrapped, creating, persistCurrentDraft, recoveryChecked, segments.length]);

  function applyLogoCornerPlacement(position: AvatarPosition) {
    setLogoPlacement(CORNER_PLACEMENTS[position]);
    setLogoSnapTarget(position);
    setLogoMagnetTarget(position);
    setEditingOverlayTarget("logo");
  }

  function applyAvatarCornerPlacement(position: AvatarPosition) {
    setAvatarPosition(position);
    setAvatarPlacement(CORNER_PLACEMENTS[position]);
    setAvatarSnapTarget(position);
    setAvatarMagnetTarget(position);
    setEditingOverlayTarget("avatar");
  }

  function selectOverlayTarget(target: OverlayEditorTarget) {
    if (target === "logo" && canEditLogoPlacement) {
      setEditingOverlayTarget("logo");
    }
    if (target === "avatar" && canEditAvatarPlacement) {
      setEditingOverlayTarget("avatar");
    }
  }

  function handleCornerHotspotClick(position: AvatarPosition) {
    clearMessages();
    if (editingOverlayTarget === "logo" && canEditLogoPlacement) {
      applyLogoCornerPlacement(position);
    }
    if (editingOverlayTarget === "avatar" && canEditAvatarPlacement) {
      applyAvatarCornerPlacement(position);
    }
  }

  function startLogoDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!overlayPreviewStageRef.current || !logoPreviewUrl || !canEditLogoPlacement) {
      return;
    }
    event.preventDefault();
    clearMessages();
    setEditingOverlayTarget("logo");
    logoDragCleanupRef.current?.();

    const stage = overlayPreviewStageRef.current;
    const stageRect = stage.getBoundingClientRect();
    const overlayWidth = clamp(stageRect.width * 0.15, 64, 140);
    const overlayHeight = overlayWidth / Math.max(logoPreviewAspectRatio, 0.4);
    const margin = OVERLAY_PREVIEW_MARGIN_PX;

    const updateDrag = (clientX: number, clientY: number) => {
      const baseX = clamp(clientX - stageRect.left - overlayWidth / 2, margin, stageRect.width - overlayWidth - margin);
      const baseY = clamp(clientY - stageRect.top - overlayHeight / 2, margin, stageRect.height - overlayHeight - margin);
      const dragResult = resolveOverlayDragResult(baseX, baseY, stageRect.width, stageRect.height, overlayWidth, overlayHeight, margin);
      setLogoDragCoords({ x: dragResult.left, y: dragResult.top, width: overlayWidth, height: overlayHeight });
      setLogoSnapTarget(dragResult.nearestTarget);
      setLogoMagnetTarget(dragResult.snappedTarget);
      return dragResult;
    };

    const finishDrag = (clientX: number, clientY: number) => {
      const dragResult = updateDrag(clientX, clientY);
      setLogoPlacement(dragResult.placement);
      setLogoSnapTarget(dragResult.nearestTarget);
      setLogoMagnetTarget(dragResult.snappedTarget);
      setDraggingLogo(false);
      setLogoDragCoords(null);
    };

    setDraggingLogo(true);
    updateDrag(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      updateDrag(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      finishDrag(upEvent.clientX, upEvent.clientY);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      logoDragCleanupRef.current = null;
    };

    logoDragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function startAvatarDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!overlayPreviewStageRef.current || !avatarPreviewUrl || !canEditAvatarPlacement) {
      return;
    }
    event.preventDefault();
    clearMessages();
    setEditingOverlayTarget("avatar");
    avatarDragCleanupRef.current?.();

    const stage = overlayPreviewStageRef.current;
    const stageRect = stage.getBoundingClientRect();
    const overlaySize = Math.min(Math.max(stageRect.width * 0.09, 36), 88);
    const margin = OVERLAY_PREVIEW_MARGIN_PX;

    const updateDrag = (clientX: number, clientY: number) => {
      const baseX = clamp(clientX - stageRect.left - overlaySize / 2, margin, stageRect.width - overlaySize - margin);
      const baseY = clamp(clientY - stageRect.top - overlaySize / 2, margin, stageRect.height - overlaySize - margin);
      const dragResult = resolveOverlayDragResult(baseX, baseY, stageRect.width, stageRect.height, overlaySize, overlaySize, margin);
      setAvatarDragCoords({ x: dragResult.left, y: dragResult.top, size: overlaySize });
      setAvatarSnapTarget(dragResult.nearestTarget);
      setAvatarMagnetTarget(dragResult.snappedTarget);
      return dragResult;
    };

    const finishDrag = (clientX: number, clientY: number) => {
      const dragResult = updateDrag(clientX, clientY);
      setAvatarPosition(dragResult.nearestTarget);
      setAvatarPlacement(dragResult.placement);
      setAvatarSnapTarget(dragResult.nearestTarget);
      setAvatarMagnetTarget(dragResult.snappedTarget);
      setDraggingAvatar(false);
      setAvatarDragCoords(null);
    };

    setDraggingAvatar(true);
    updateDrag(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      updateDrag(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      finishDrag(upEvent.clientX, upEvent.clientY);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      avatarDragCleanupRef.current = null;
    };

    avatarDragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function validateWizardStep(targetStep: WizardStep): string | null {
    if (targetStep === 1 && (segments.length < 2 || segments.length > 10)) {
      return translate("dashboard.longVideo.invalidImageCount");
    }
    if (targetStep === 2) {
      if (editMode === "unified" && !sceneTemplateId) {
        return translate("dashboard.longVideo.chooseTemplateFirst");
      }
      if (editMode === "custom" && segments.some((segment) => !segment.sceneTemplateId)) {
        return translate("dashboard.longVideo.chooseTemplateFirst");
      }
    }
    if (targetStep === 3) {
      if (enableLogo && logos.length === 0) {
        return translate("dashboard.longVideo.noLogoAvailable");
      }
      if (enableLogo && !selectedLogoKey) {
        return translate("dashboard.longVideo.chooseLogoFirst");
      }
      if (enableAvatar && supportsAvatarOverlay && avatars.length === 0) {
        return translate("dashboard.longVideo.avatarUploadFirst");
      }
      if (enableAvatar && supportsAvatarOverlay && !selectedAvatarKey) {
        return translate("dashboard.longVideo.avatarChooseFirst");
      }
      if (enableProfileCard && supportsEndingProfileCard && profileCards.length === 0) {
        return translate("dashboard.longVideo.profileCardCreateFirst");
      }
      if (enableProfileCard && supportsEndingProfileCard && !selectedProfileCardId) {
        return translate("dashboard.longVideo.profileCardChooseFirst");
      }
    }
    return null;
  }

  function goToNextStep() {
    const error = validateWizardStep(step);
    if (error) {
      setFormError(error);
      return;
    }
    clearMessages();
    setStep((current) => Math.min(current + 1, 3) as WizardStep);
  }

  function goToPreviousStep() {
    clearMessages();
    setStep((current) => Math.max(current - 1, 1) as WizardStep);
  }

  async function submitTask() {
    const error = validateWizardStep(1) ?? validateWizardStep(2) ?? validateWizardStep(3);
    if (error) {
      setFormError(error);
      return;
    }
    setCreating(true);
    setCreatingStage("");
    setFormError("");
    setFormMessage("");
    const controller = new AbortController();
    submitAbortControllerRef.current = controller;
    try {
      await queueDraftForSubmission(undefined, controller.signal);
    } catch (err) {
      if (isAbortError(err)) {
        suspendDraftAutosaveRef.current = false;
        await persistCurrentDraft("editing");
        setFormMessage(translate("dashboard.longVideo.createCancelled"));
        return;
      }
      if (err instanceof UnauthorizedError) {
        return;
      }
      setFormError(err instanceof Error ? err.message : translate("dashboard.longVideo.createFailed"));
    } finally {
      submitAbortControllerRef.current = null;
      setCreating(false);
      setCreatingStage("");
    }
  }

  async function handleCancelCurrentTask() {
    submitAbortControllerRef.current?.abort();
    suspendDraftAutosaveRef.current = false;
    clearMessages();
    revokeSegmentUrls(latestSegmentsRef.current);
    if (editorDraftId) {
      await deletePendingVideoDraft(editorDraftId);
    } else {
      await clearActivePendingVideoDraft(LONG_DRAFT_SCOPE);
    }
    setRecoveryDraft(null);
    setEditorDraftId("");
    setStep(1);
    setSegments([]);
    setSceneTemplateId("");
    setSegmentTemplateSeedId("");
    setPropertyType("standard_home");
    setDurationSeconds(4);
    setEditMode("unified");
    setEnableLogo(false);
    setLogoPlacement(CORNER_PLACEMENTS.bottom_right);
    setEnableAvatar(false);
    setAvatarPosition("bottom_right");
    setAvatarPlacement(CORNER_PLACEMENTS.bottom_right);
    setEnableProfileCard(false);
    setEditingOverlayTarget(null);
    setDraggingId("");
    setCreating(false);
    setCreatingStage("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    setFormMessage(translate("dashboard.longVideo.taskCancelled"));
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      goToNextStep();
      return;
    }
    await submitTask();
  }

  async function handleResumeEditing() {
    if (!recoveryDraft || recoveryDraft.task_type !== "long") {
      return;
    }
    suspendDraftAutosaveRef.current = false;
    clearMessages();
    restoreDraftIntoEditor(recoveryDraft);
    setRecoveryDraft(null);
    setFormMessage(translate("dashboard.longVideo.draftRestored"));
  }

  async function handleDiscardDraft() {
    clearMessages();
    await clearActivePendingVideoDraft(LONG_DRAFT_SCOPE);
    setRecoveryDraft(null);
    if (segments.length === 0) {
      setEditorDraftId("");
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
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.longVideo.createTitle")}</h2>
          <p className="mt-2 text-sm text-gray-600">
            {translate("dashboard.longVideo.wizardIntro")}
          </p>
        </div>

        {recoveryChecked && recoveryDraft ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-medium">{translate("dashboard.longVideo.recoveryTitle")}</p>
            <p className="mt-1 text-amber-800">
              {translate(
                recoveryDraft.status === "auth_required"
                  ? "dashboard.longVideo.recoveryAuthRequiredDescription"
                  : "dashboard.longVideo.recoveryEditingDescription",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleResumeEditing()}
                className="rounded-full bg-white px-4 py-2 font-medium text-amber-900 shadow-sm ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
              >
                {translate("dashboard.longVideo.recoveryContinueEditing")}
              </button>
              <button
                type="button"
                onClick={() => void handleDiscardDraft()}
                className="rounded-full px-4 py-2 font-medium text-amber-900 transition hover:bg-amber-100"
              >
                {translate("dashboard.longVideo.recoveryDiscard")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch">
          {wizardSteps.map((wizardStep, index) => {
            const isActive = step === wizardStep.id;
            const isCompleted = step > wizardStep.id;
            return (
              <Fragment key={wizardStep.id}>
                <div className="md:flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (wizardStep.id <= step) {
                        clearMessages();
                        setStep(wizardStep.id);
                      }
                    }}
                    className={`h-full w-full rounded-2xl border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-blue-700 bg-blue-100 shadow-sm"
                        : isCompleted
                          ? "border-blue-200 bg-blue-50/60"
                          : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          isActive || isCompleted ? "bg-blue-700 text-white" : "bg-white text-gray-500"
                        }`}
                      >
                        {wizardStep.id}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{wizardStep.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{wizardStep.description}</p>
                      </div>
                    </div>
                  </button>
                </div>
                {index < wizardSteps.length - 1 ? (
                  <div
                    aria-hidden="true"
                    className={`hidden px-1 text-xl font-semibold md:flex md:flex-none md:items-center md:justify-center ${
                      step > wizardStep.id ? "text-blue-400" : "text-blue-200"
                    }`}
                  >
                    <span className="-translate-y-px select-none">{">"}</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>

        <form onSubmit={handleCreateTask} className="mt-6 space-y-5">
          <div ref={stepContentRef} />

          {step === 1 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
                <p className="text-sm font-semibold text-gray-900">{translate("dashboard.longVideo.imagesLabel")}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {translate("dashboard.longVideo.uploadStepHint")}
                </p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  multiple
                  onChange={(e) => {
                    clearMessages();
                    handleFilesSelected(Array.from(e.target.files || []));
                    e.currentTarget.value = "";
                  }}
                  className="hidden"
                />
                <div className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-white p-6">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {translate("dashboard.longVideo.uploadImage")}
                  </button>
                  <p className="mt-3 text-xs text-gray-500">
                    {segments.length > 0
                      ? translate("dashboard.longVideo.imagesSelected", { count: segments.length })
                      : translate("dashboard.longVideo.imagesHint")}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-5">
                <p className="text-sm font-semibold text-gray-900">{translate("dashboard.longVideo.selectedImagesTitle")}</p>
                {segments.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {segments.slice(0, 4).map((segment, index) => (
                        <div key={segment.id} className="overflow-hidden rounded-2xl border bg-white">
                          <Image
                            src={segment.previewUrl}
                            alt={segment.file.name}
                            width={800}
                            height={450}
                            unoptimized
                            className="h-28 w-full object-cover"
                          />
                          <div className="px-3 py-2">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {index + 1}. {segment.file.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {segments.length > 4 && (
                      <p className="text-xs text-gray-500">{translate("dashboard.longVideo.selectedImagesMore", { count: segments.length - 4 })}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex h-72 items-center justify-center rounded-2xl border border-dashed bg-white text-sm text-gray-500">
                    {translate("dashboard.longVideo.selectedImagesEmpty")}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-gray-50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.propertyTypeLabel")}</label>
                  <InfoTooltip text={translate("dashboard.longVideo.propertyTypeHint")} ariaLabel={translate("common.moreInfo")} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setPropertyType(option);
                      }}
                      className={`rounded-xl border px-4 py-3 text-left ${
                        propertyType === option ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{renderPropertyTypeLabel(translate, option)}</p>
                      <p className="mt-1 text-xs text-gray-500">{renderPropertyTypeHint(translate, option)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.resolutionLabel")}</label>
                    <InfoTooltip text={translate("dashboard.shortVideo.resolutionFixedHint")} ariaLabel={translate("common.moreInfo")} />
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    {translate("common.fixed1080p")}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.aspectRatioLabel")}</label>
                    <InfoTooltip text={translate("dashboard.shortVideo.aspectRatioFixedHint")} ariaLabel={translate("common.moreInfo")} />
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">16:9</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setEditMode("unified");
                    }}
                    className={`rounded-2xl border p-4 text-left ${
                      editMode === "unified" ? "border-blue-600 bg-blue-50" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{translate("dashboard.longVideo.unifiedModeTitle")}</p>
                      <InfoTooltip text={translate("dashboard.longVideo.unifiedModeSubtitle")} ariaLabel={translate("common.moreInfo")} />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{translate("dashboard.longVideo.customModeTitle")}</p>
                        <InfoTooltip text={translate("dashboard.longVideo.customModeSubtitle")} ariaLabel={translate("common.moreInfo")} />
                      </div>
                      {!canUseCustomMode && (
                        <PlanBadge>Pro/Ultimate</PlanBadge>
                      )}
                    </div>
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
                          onChange={(e) => {
                            clearMessages();
                            setSceneTemplateId(e.target.value);
                          }}
                          disabled={unifiedTemplates.length === 0}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          {unifiedTemplates.length === 0 ? (
                            <option value="">{translate("dashboard.longVideo.noTemplatesForPropertyType")}</option>
                          ) : (
                            unifiedTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {getTemplateLabel(template)}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.unifiedDuration")}</label>
                        <select
                          value={durationSeconds}
                          onChange={(e) => {
                            clearMessages();
                            setDurationSeconds(Number(e.target.value));
                          }}
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
                          onChange={(e) => {
                            clearMessages();
                            setSegmentTemplateSeedId(e.target.value);
                          }}
                          disabled={!canUseCustomMode || segmentTemplates.length === 0}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                        >
                          {segmentTemplates.length === 0 ? (
                            <option value="">{translate("dashboard.longVideo.noTemplatesForPropertyType")}</option>
                          ) : (
                            segmentTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {getTemplateLabel(template)}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            clearMessages();
                            applyTemplateToAll();
                          }}
                          disabled={!canUseCustomMode || !segmentTemplateSeedId || segments.length === 0}
                          className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                        >
                          {translate("dashboard.longVideo.applyTemplateToAll")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearMessages();
                            applyDurationToAll();
                          }}
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
                                onChange={(e) => {
                                  clearMessages();
                                  updateSegment(segment.id, { sceneTemplateId: e.target.value });
                                }}
                                disabled={!canUseCustomMode || !supportsPerImageTemplate || segmentTemplates.length === 0}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                              >
                                {segmentTemplates.length === 0 ? (
                                  <option value="">{translate("dashboard.longVideo.noTemplatesForPropertyType")}</option>
                                ) : (
                                  segmentTemplates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                      {getTemplateLabel(template)}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.longVideo.perSegmentDuration")}</label>
                              <select
                                value={segment.durationSeconds}
                                onChange={(e) => {
                                  clearMessages();
                                  updateSegment(segment.id, { durationSeconds: Number(e.target.value) });
                                }}
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
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-medium">{translate("dashboard.longVideo.advancedOverlayTitle")}</p>
                <p className="mt-1">{translate("dashboard.longVideo.advancedOverlayDescription")}</p>
                <Link
                  href="/account/logos"
                  onClick={() => {
                    void persistCurrentDraft("editing");
                  }}
                  className="mt-2 inline-flex text-sm font-medium text-blue-700 underline"
                >
                  {translate("dashboard.longVideo.openAssetsCenter")}
                </Link>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div
                className={`rounded-2xl border bg-white p-5 transition ${
                  editingOverlayTarget === "logo" ? "border-blue-300 shadow-sm" : "border-gray-200"
                }`}
              >
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={enableLogo}
                    onChange={(e) => {
                      clearMessages();
                      setEnableLogo(e.target.checked);
                      if (e.target.checked && supportsLogoPositionCustomize) {
                        setEditingOverlayTarget("logo");
                      }
                    }}
                  />
                  {translate("dashboard.shortVideo.addLogo")}
                </label>
                {enableLogo && (
                  <div className="mt-3 space-y-3">
                    {logos.length > 0 ? (
                      <>
                        <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.chooseUploadedLogo")}</label>
                        <select
                          value={selectedLogoKey}
                          onChange={(e) => {
                            clearMessages();
                            setSelectedLogoKey(e.target.value);
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          {logos.map((logo) => (
                            <option key={logo.key} value={logo.key}>
                              {logo.is_default ? `${logo.name} (${translate("common.default")})` : logo.name}
                            </option>
                          ))}
                        </select>
                        {supportsLogoPositionCustomize ? (
                          <button
                            type="button"
                            onClick={() => selectOverlayTarget("logo")}
                            className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                              editingOverlayTarget === "logo"
                                ? "border-blue-500 bg-blue-50 text-blue-800"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{translate("dashboard.longVideo.logoPlacementTitle")}</div>
                              <InfoTooltip text={translate("dashboard.longVideo.overlayPlacementHelp")} ariaLabel={translate("common.moreInfo")} />
                            </div>
                          </button>
                        ) : (
                          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                            Upgrade to Pro/Ultimate plan to unlock custom logo position feature.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-700">{translate("dashboard.longVideo.noLogoAvailable")}</p>
                        <Link
                          href="/account/logos"
                          onClick={() => {
                            void persistCurrentDraft("editing");
                          }}
                          className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                        >
                          {translate("dashboard.shortVideo.goUploadLogo")}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {supportsAvatarOverlay ? (
                <div
                  className={`rounded-2xl border bg-white p-5 transition ${
                    editingOverlayTarget === "avatar" ? "border-blue-300 shadow-sm" : "border-gray-200"
                  }`}
                >
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={enableAvatar}
                      onChange={(e) => {
                        clearMessages();
                        setEnableAvatar(e.target.checked);
                        if (e.target.checked) {
                          setEditingOverlayTarget("avatar");
                        }
                      }}
                    />
                                            {translate("dashboard.longVideo.addAvatarOverlay")}
                  </label>
                  {enableAvatar && (
                    <div className="mt-3 space-y-3">
                      {avatars.length > 0 ? (
                        <>
                          <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.chooseUploadedAvatar")}</label>
                          <select
                            value={selectedAvatarKey}
                            onChange={(e) => {
                              clearMessages();
                              setSelectedAvatarKey(e.target.value);
                            }}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          >
                            {avatars.map((avatar) => (
                              <option key={avatar.key} value={avatar.key}>
                                {avatar.is_default ? `${avatar.name} (${translate("common.default")})` : avatar.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => selectOverlayTarget("avatar")}
                            className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                              editingOverlayTarget === "avatar"
                                ? "border-blue-500 bg-blue-50 text-blue-800"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{translate("dashboard.longVideo.avatarPlacementTitle")}</div>
                              <InfoTooltip text={translate("dashboard.longVideo.overlayPlacementHelp")} ariaLabel={translate("common.moreInfo")} />
                            </div>
                          </button>
                        </>
                      ) : (
                        <Link
                          href="/account/logos"
                          onClick={() => {
                            void persistCurrentDraft("editing");
                          }}
                          className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                        >
                                                            {translate("dashboard.longVideo.goUploadAvatar")}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{translate("dashboard.longVideo.addAvatarOverlay")}</span>
                  <PlanBadge>Pro/Ultimate</PlanBadge>
                </div>
              )}

              {supportsEndingProfileCard ? (
                <div className="rounded-2xl border bg-white p-5">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={enableProfileCard}
                      onChange={(e) => {
                        clearMessages();
                        setEnableProfileCard(e.target.checked);
                      }}
                    />
                                                {translate("dashboard.longVideo.addEndingProfileCard")}
                  </label>
                  {enableProfileCard && (
                    <div className="mt-3">
                      {profileCards.length > 0 ? (
                        <select
                          value={selectedProfileCardId}
                          onChange={(e) => {
                            clearMessages();
                            setSelectedProfileCardId(e.target.value);
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          {profileCards.map((card) => (
                            <option key={card.id} value={card.id}>
                              {card.is_default ? `${card.display_name} (${translate("common.default")})` : card.display_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Link
                          href="/account/logos"
                          onClick={() => {
                            void persistCurrentDraft("editing");
                          }}
                          className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                        >
                                                            {translate("dashboard.longVideo.goCreateProfileCard")}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{translate("dashboard.longVideo.addEndingProfileCard")}</span>
                  <PlanBadge>Pro/Ultimate</PlanBadge>
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{translate("dashboard.longVideo.overlayPreviewTitle")}</p>
                    <InfoTooltip
                      text={
                        canEditCurrentOverlay
                          ? translate("dashboard.longVideo.overlayPreviewHintEditable")
                          : enableLogo
                            ? translate("dashboard.longVideo.overlayPreviewHintFixed")
                            : translate("dashboard.longVideo.overlayPreviewHintEmpty")
                      }
                      ariaLabel={translate("common.moreInfo")}
                    />
                  </div>
                </div>
                {editingOverlayTarget && (
                  <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                                {translate("dashboard.longVideo.editingLabel")}: {formatOverlayEditorTargetLabel(translate, editingOverlayTarget)}
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-100">
                <div ref={overlayPreviewStageRef} className="relative aspect-video w-full">
                  {previewBackgroundUrl ? (
                    <Image src={previewBackgroundUrl} alt="Overlay editor preview background" fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      Upload at least two images above to preview overlay placement.
                    </div>
                  )}

                  {canEditCurrentOverlay &&
                    AVATAR_POSITIONS.map((position) => (
                      <button
                        key={`overlay-hotspot-${position}`}
                        type="button"
                                                        aria-label={`Snap to ${formatOverlayPositionLabel(translate, position)}`}
                        onClick={() => handleCornerHotspotClick(position)}
                        className={`absolute h-14 w-14 rounded-2xl border-2 transition ${
                          getOverlayTargetStateClasses(position, currentOverlayNearestTarget, currentOverlayMagnetTarget)
                        } ${getOverlayTargetClassName(position)}`}
                      />
                    ))}

                  {logoPreviewUrl && enableLogo && (
                    <button
                      type="button"
                      onClick={() => selectOverlayTarget("logo")}
                      onPointerDown={canEditLogoPlacement ? startLogoDrag : undefined}
                      className={`absolute touch-none overflow-hidden rounded-xl border shadow-lg transition ${
                        editingOverlayTarget === "logo"
                          ? "border-blue-500 bg-white/90 ring-4 ring-blue-200"
                          : "border-white/90 bg-white/80"
                      } ${canEditLogoPlacement ? (draggingLogo ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
                      style={
                        logoDragCoords
                          ? {
                              left: `${logoDragCoords.x}px`,
                              top: `${logoDragCoords.y}px`,
                              width: `${logoDragCoords.width}px`,
                              height: `${logoDragCoords.height}px`,
                            }
                          : buildOverlayPlacementStyle(
                              effectiveLogoPlacement,
                              LOGO_PREVIEW_WIDTH_EXPR,
                              `calc(${LOGO_PREVIEW_WIDTH_EXPR} / ${Math.max(logoPreviewAspectRatio, 0.4)})`,
                            )
                      }
                    >
                      <Image src={logoPreviewUrl} alt="Logo overlay preview" fill unoptimized className="object-contain" />
                    </button>
                  )}

                  {avatarPreviewUrl && enableAvatar && supportsAvatarOverlay && (
                    <button
                      type="button"
                      onClick={() => selectOverlayTarget("avatar")}
                      onPointerDown={canEditAvatarPlacement ? startAvatarDrag : undefined}
                      className={`absolute touch-none overflow-hidden rounded-full border-2 bg-white/90 shadow-lg transition ${
                        editingOverlayTarget === "avatar"
                          ? "border-blue-500 ring-4 ring-blue-200"
                          : "border-white"
                      } ${canEditAvatarPlacement ? (draggingAvatar ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
                      style={
                        avatarDragCoords
                          ? {
                              left: `${avatarDragCoords.x}px`,
                              top: `${avatarDragCoords.y}px`,
                              width: `${avatarDragCoords.size}px`,
                              height: `${avatarDragCoords.size}px`,
                            }
                          : buildOverlayPlacementStyle(
                              avatarPlacement,
                              AVATAR_PREVIEW_WIDTH_EXPR,
                              AVATAR_PREVIEW_WIDTH_EXPR,
                              { keepSquare: true },
                            )
                      }
                    >
                      <Image src={avatarPreviewUrl} alt="Avatar overlay preview" fill unoptimized className="object-cover" />
                    </button>
                  )}

                  {(logoPreviewLoading || avatarPreviewLoading) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/45 text-sm text-gray-600">
                      Loading overlay preview...
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <p>
                                            <span className="font-medium text-gray-900">{translate("dashboard.longVideo.editingLabel")}:</span>{" "}
                                            {editingOverlayTarget
                                              ? formatOverlayEditorTargetLabel(translate, editingOverlayTarget)
                                              : translate("dashboard.longVideo.noEditableOverlaySelected")}
                </p>
                <p>
                                            <span className="font-medium text-gray-900">{translate("dashboard.longVideo.placementLabel")}:</span>{" "}
                                            {currentOverlayPlacementLabel ?? (enableLogo ? translate("dashboard.longVideo.fixedBottomRightBasic") : translate("dashboard.longVideo.notSet"))}
                </p>
                {currentOverlayPlacement && canEditCurrentOverlay && (
                                            <p className="text-xs text-gray-500">{translate("dashboard.longVideo.overlayPlacementHelp")}</p>
                )}
              </div>
            </div>
              </div>
            </div>
          )}

          {creatingStage && <p className="text-sm text-blue-600">{creatingStage}</p>}
          {formMessage && <p className="text-sm text-green-600">{formMessage}</p>}
          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex flex-wrap items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={goToPreviousStep}
                className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                {translate("common.back")}
              </button>
            )}
            {step < 3 ? (
              <button
                key="wizard-continue"
                type="button"
                onClick={goToNextStep}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                {translate("common.continue")}
              </button>
            ) : (
              <button
                key="wizard-submit"
                type="button"
                onClick={() => void submitTask()}
                disabled={creating || quota.total_available < Math.max(segments.length, 1)}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? translate("dashboard.longVideo.creating") : translate("dashboard.longVideo.create")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCancelCurrentTask()}
              className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {translate("dashboard.longVideo.cancelTask")}
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveOverlaySnapTarget(centerX: number, centerY: number, width: number, height: number): AvatarPosition {
  const vertical = centerY < height / 2 ? "top" : "bottom";
  const horizontal = centerX < width / 2 ? "left" : "right";
  return `${vertical}_${horizontal}` as AvatarPosition;
}

function resolveOverlaySnapTargetByPlacement(placement: OverlayPlacement): AvatarPosition {
  return resolveOverlaySnapTarget(placement.x, placement.y, 1, 1);
}

function formatOverlayPositionLabel(translate: (key: string) => string, position: AvatarPosition) {
  if (position === "top_left") return translate("common.positionTopLeft");
  if (position === "top_right") return translate("common.positionTopRight");
  if (position === "bottom_left") return translate("common.positionBottomLeft");
  return translate("common.positionBottomRight");
}

function formatOverlayEditorTargetLabel(translate: (key: string) => string, target: Exclude<OverlayEditorTarget, null>) {
  return target === "logo" ? translate("common.overlayLogo") : translate("common.overlayAvatar");
}

function formatOverlayPlacementSummary(
  translate: (key: string, params?: Record<string, string | number>) => string,
  placement: OverlayPlacement,
  fallbackPosition: AvatarPosition,
) {
  const matchedCorner = AVATAR_POSITIONS.find((position) => isPlacementAtCorner(placement, position));
  return matchedCorner
    ? formatOverlayPositionLabel(translate, matchedCorner)
    : translate("common.freeDragPlacement", {
        position: formatOverlayPositionLabel(translate, fallbackPosition),
      });
}

function isPlacementAtCorner(placement: OverlayPlacement, position: AvatarPosition) {
  const corner = CORNER_PLACEMENTS[position];
  return Math.abs(placement.x - corner.x) < 0.001 && Math.abs(placement.y - corner.y) < 0.001;
}

function getPlacementCornerTarget(placement: OverlayPlacement) {
  return AVATAR_POSITIONS.find((position) => isPlacementAtCorner(placement, position)) ?? null;
}

function buildOverlayPlacementFromPixels(
  left: number,
  top: number,
  stageWidth: number,
  stageHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  margin: number,
): OverlayPlacement {
  const availableWidth = Math.max(stageWidth - overlayWidth - margin * 2, 1);
  const availableHeight = Math.max(stageHeight - overlayHeight - margin * 2, 1);
  return {
    x: clamp((left - margin) / availableWidth, 0, 1),
    y: clamp((top - margin) / availableHeight, 0, 1),
  };
}

function resolveOverlayDragResult(
  left: number,
  top: number,
  stageWidth: number,
  stageHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  margin: number,
) {
  const nearestTarget = resolveOverlaySnapTarget(
    left + overlayWidth / 2,
    top + overlayHeight / 2,
    stageWidth,
    stageHeight,
  );
  const snapThreshold = Math.min(
    OVERLAY_SNAP_THRESHOLD_PX,
    Math.max(Math.min(stageWidth, stageHeight) * 0.14, 28),
  );
  const corners = AVATAR_POSITIONS.map((position) => {
    const cornerPlacement = CORNER_PLACEMENTS[position];
    const cornerLeft = margin + (stageWidth - overlayWidth - margin * 2) * cornerPlacement.x;
    const cornerTop = margin + (stageHeight - overlayHeight - margin * 2) * cornerPlacement.y;
    const distance = Math.hypot(left - cornerLeft, top - cornerTop);
    return { position, cornerLeft, cornerTop, distance };
  }).sort((a, b) => a.distance - b.distance);
  const snappedCorner = corners[0] && corners[0].distance <= snapThreshold ? corners[0] : null;
  if (snappedCorner) {
    return {
      left: snappedCorner.cornerLeft,
      top: snappedCorner.cornerTop,
      placement: CORNER_PLACEMENTS[snappedCorner.position],
      nearestTarget: snappedCorner.position,
      snappedTarget: snappedCorner.position,
    };
  }
  return {
    left,
    top,
    placement: buildOverlayPlacementFromPixels(left, top, stageWidth, stageHeight, overlayWidth, overlayHeight, margin),
    nearestTarget,
    snappedTarget: null,
  };
}

function buildOverlayPlacementStyle(
  placement: OverlayPlacement,
  widthExpr: string,
  heightExpr: string,
  options?: { keepSquare?: boolean },
) {
  return {
    width: widthExpr,
    ...(options?.keepSquare ? { aspectRatio: "1 / 1" } : { height: heightExpr }),
    left: `calc(${OVERLAY_PREVIEW_MARGIN_PX}px + (100% - ${OVERLAY_PREVIEW_MARGIN_PX * 2}px - ${widthExpr}) * ${placement.x})`,
    top: `calc(${OVERLAY_PREVIEW_MARGIN_PX}px + (100% - ${OVERLAY_PREVIEW_MARGIN_PX * 2}px - ${heightExpr}) * ${placement.y})`,
  };
}

function getOverlayTargetClassName(position: AvatarPosition) {
  if (position === "top_left") return "left-3 top-3";
  if (position === "top_right") return "right-3 top-3";
  if (position === "bottom_left") return "bottom-3 left-3";
  return "bottom-3 right-3";
}

function getOverlayTargetStateClasses(
  position: AvatarPosition,
  currentTarget: AvatarPosition,
  snappedTarget: AvatarPosition | null,
) {
  if (snappedTarget === position) {
    return "scale-110 border-blue-600 bg-blue-500/25 shadow-[0_0_0_4px_rgba(59,130,246,0.2)]";
  }
  if (currentTarget === position) {
    return "border-blue-400 bg-blue-400/12";
  }
  return "border-white/70 bg-white/15";
}

async function readImageAspectRatio(src: string) {
  const image = new window.Image();
  return await new Promise<number>((resolve) => {
    image.onload = () => resolve(image.naturalWidth / Math.max(image.naturalHeight, 1));
    image.onerror = () => resolve(3);
    image.src = src;
  });
}

function renderPropertyTypeLabel(
  translate: (key: string) => string,
  propertyType: SceneTemplatePropertyType,
) {
  if (propertyType === "luxury_home") return translate("common.propertyTypeLuxuryHome");
  if (propertyType === "apartment_rental") return translate("common.propertyTypeApartmentRental");
  return translate("common.propertyTypeStandardHome");
}

function renderPropertyTypeHint(
  translate: (key: string) => string,
  propertyType: SceneTemplatePropertyType,
) {
  if (propertyType === "luxury_home") return translate("common.propertyTypeLuxuryHomeHint");
  if (propertyType === "apartment_rental") return translate("common.propertyTypeApartmentRentalHint");
  return translate("common.propertyTypeStandardHomeHint");
}
