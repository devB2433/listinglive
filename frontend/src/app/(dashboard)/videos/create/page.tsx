"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { InfoTooltip, PlanBadge } from "@/components/ui/field-help";
import { hasCapability } from "@/lib/capabilities";
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
import { getSceneTemplateDisplayName } from "@/lib/locale";
import {
  clearActivePendingVideoDraft,
  createPendingShortVideoDraft,
  deletePendingVideoDraft,
  getActivePendingVideoDraft,
  savePendingVideoDraft,
  type PendingVideoDraftStatus,
  type StoredPendingVideoDraft,
} from "@/lib/pending-video-task";
import { getQuotaSubmissionState } from "@/lib/quota-flow";
import {
  getCachedProfileCards,
  getCachedSceneTemplates,
  getCachedUserAvatars,
  getCachedUserLogos,
} from "@/lib/video-config-cache";

const ALL_DURATIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
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
const SHORT_DRAFT_SCOPE = "short_create" as const;
type WizardStep = 1 | 2 | 3;
type OverlayEditorTarget = "logo" | "avatar" | null;

export default function VideoCreatePage() {
  const { accessToken, quota } = useDashboardSession();
  const { translate } = useLocale();
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const stepContentRef = useRef<HTMLDivElement | null>(null);
  const submitAbortControllerRef = useRef<AbortController | null>(null);
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [avatars, setAvatars] = useState<UserAvatar[]>([]);
  const [profileCards, setProfileCards] = useState<ProfileCard[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [editorDraftId, setEditorDraftId] = useState("");
  const [recoveryDraft, setRecoveryDraft] = useState<StoredPendingVideoDraft | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const suspendDraftAutosaveRef = useRef(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
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
  const [sceneTemplateId, setSceneTemplateId] = useState("");
  const resolution = "1080p" as const;
  const aspectRatio = "16:9" as const;
  const [durationSeconds, setDurationSeconds] = useState(2);
  const [serviceTier, setServiceTier] = useState<"standard" | "flex">("standard");
  const [propertyType, setPropertyType] = useState<SceneTemplatePropertyType>("standard_home");
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
  const logoPreviewUrlRef = useRef("");
  const overlayPreviewStageRef = useRef<HTMLDivElement | null>(null);
  const logoDragCleanupRef = useRef<(() => void) | null>(null);
  const avatarPreviewUrlRef = useRef("");
  const avatarDragCleanupRef = useRef<(() => void) | null>(null);

  const fixedDuration = quota.limits.short_fixed_duration_seconds;
  const durationEditable = quota.limits.short_duration_editable;
  const supportsLogoPositionCustomize = hasCapability(quota, "logo_position_customize");
  const supportsAvatarOverlay = hasCapability(quota, "avatar_overlay");
  const supportsEndingProfileCard = hasCapability(quota, "ending_profile_card");
  const effectiveDuration = durationEditable ? durationSeconds : fixedDuration || durationSeconds;
  const quotaSubmissionState = getQuotaSubmissionState(1, quota.schedulable_available);
  const { requiredQuota, availableQuota, canSubmit: canSubmitWithQuota } = quotaSubmissionState;
  const selectedLogo = logos.find((logo) => logo.key === selectedLogoKey) || null;
  const selectedAvatar = avatars.find((avatar) => avatar.key === selectedAvatarKey) || null;
  const canEditLogoPlacement = enableLogo && !!selectedLogo && supportsLogoPositionCustomize;
  const canEditAvatarPlacement = enableAvatar && !!selectedAvatar && supportsAvatarOverlay;
  const effectiveLogoPlacement = supportsLogoPositionCustomize ? logoPlacement : CORNER_PLACEMENTS.bottom_right;
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
  const getTemplateLabel = (template: SceneTemplate) =>
    getSceneTemplateDisplayName(translate, template.template_key, template.name);
  const wizardSteps = [
    {
      id: 1 as const,
      title: translate("dashboard.shortVideo.wizardStepUploadTitle"),
      description: translate("dashboard.shortVideo.wizardStepUploadDescription"),
    },
    {
      id: 2 as const,
      title: translate("dashboard.shortVideo.wizardStepStyleTitle"),
      description: translate("dashboard.shortVideo.wizardStepStyleDescription"),
    },
    {
      id: 3 as const,
      title: translate("dashboard.shortVideo.wizardStepBrandingTitle"),
      description: translate("dashboard.shortVideo.wizardStepBrandingDescription"),
    },
  ];

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCachedSceneTemplates(accessToken, "short", { propertyType }),
      getCachedUserLogos(accessToken),
      getCachedUserAvatars(accessToken),
      getCachedProfileCards(accessToken),
    ])
      .then(([templateData, logoData, avatarData, profileCardData]) => {
        if (cancelled) return;
        setTemplates(templateData);
        setLogos(logoData);
        setAvatars(avatarData);
        setProfileCards(profileCardData);
        const defaultLogo = logoData.find((item) => item.is_default) || logoData[0];
        const defaultAvatar = avatarData.find((item) => item.is_default) || avatarData[0];
        const defaultProfileCard = profileCardData.find((item) => item.is_default) || profileCardData[0];
        setSceneTemplateId((current) =>
          current && templateData.some((template) => template.id === current) ? current : (templateData[0]?.id ?? ""),
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
        setFormError(err instanceof Error ? err.message : translate("dashboard.shortVideo.createFailed"));
      })
      .finally(() => setBootstrapped(true));
    return () => {
      cancelled = true;
    };
  }, [accessToken, propertyType, translate]);

  useEffect(() => {
    if (!durationEditable && fixedDuration && durationSeconds !== fixedDuration) {
      setDurationSeconds(fixedDuration);
    }
  }, [durationEditable, durationSeconds, fixedDuration]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!bootstrapped) return;
    stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bootstrapped, step]);

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
        if (!active) {
          return;
        }
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
        if (!active) {
          return;
        }
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
        if (!active) {
          return;
        }
        const nextUrl = URL.createObjectURL(blob);
        if (avatarPreviewUrlRef.current) {
          URL.revokeObjectURL(avatarPreviewUrlRef.current);
        }
        avatarPreviewUrlRef.current = nextUrl;
        setAvatarPreviewUrl(nextUrl);
      })
      .catch(() => {
        if (!active) {
          return;
        }
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

  function inferShortDraftStep(draft: StoredPendingVideoDraft): WizardStep {
    if (draft.task_type !== "short") {
      return 1;
    }
    if (draft.wizard_step && draft.wizard_step >= 1 && draft.wizard_step <= 3) {
      return draft.wizard_step;
    }
    if (draft.logo_key || draft.avatar_key || draft.profile_card_id) {
      return 3;
    }
    if (draft.scene_template_id) {
      return 2;
    }
    return 1;
  }

  const restoreDraftIntoEditor = useCallback((draft: StoredPendingVideoDraft) => {
    if (draft.task_type !== "short") {
      return;
    }
    setEditorDraftId(draft.id);
    setImageFile(draft.image_file);
    setPropertyType(draft.property_type);
    setSceneTemplateId(draft.scene_template_id);
    setDurationSeconds(draft.duration_seconds);
    setServiceTier(draft.service_tier);
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
    setStep(inferShortDraftStep(draft));
    suspendDraftAutosaveRef.current = false;
  }, []);

  const buildCurrentDraft = useCallback(
    (status: PendingVideoDraftStatus) => {
      if (!imageFile) {
        return null;
      }
      return createPendingShortVideoDraft(
        {
          image_file: imageFile,
          wizard_step: step,
          property_type: propertyType,
          scene_template_id: sceneTemplateId,
          resolution,
          aspect_ratio: aspectRatio,
          duration_seconds: effectiveDuration,
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
                include_logo: false,
              }
            : null,
          service_tier: serviceTier,
        },
        {
          id: editorDraftId || undefined,
          scope: SHORT_DRAFT_SCOPE,
          status,
        },
      );
    },
    [
      aspectRatio,
      avatarPlacement,
      avatarPosition,
      editorDraftId,
      effectiveDuration,
      enableAvatar,
      enableLogo,
      enableProfileCard,
      imageFile,
      logoPlacement,
      propertyType,
      resolution,
      sceneTemplateId,
      selectedAvatarKey,
      selectedLogoKey,
      selectedProfileCardId,
      step,
      serviceTier,
      supportsAvatarOverlay,
      supportsEndingProfileCard,
      supportsLogoPositionCustomize,
    ],
  );

  const persistCurrentDraft = useCallback(
    async (status: PendingVideoDraftStatus) => {
      const draft = buildCurrentDraft(status);
      if (!draft) {
        console.info("[draft-debug]", "persist_skipped_no_draft", { status });
        return null;
      }
      const savedDraft = await savePendingVideoDraft(draft);
      console.info("[draft-debug]", "persist_saved", {
        draftId: savedDraft.id,
        status: savedDraft.status,
        taskType: savedDraft.task_type,
        sceneTemplateId: savedDraft.scene_template_id,
      });
      setEditorDraftId(savedDraft.id);
      return savedDraft;
    },
    [buildCurrentDraft],
  );

  const queueDraftForSubmission = useCallback(
    async (sourceDraft?: StoredPendingVideoDraft | null, signal?: AbortSignal) => {
      console.info("[draft-debug]", "queue_for_submission_start", {
        sourceDraftId: sourceDraft?.id ?? null,
        sourceStatus: sourceDraft?.status ?? null,
        editorDraftId,
      });
      const baseDraft =
        sourceDraft && sourceDraft.task_type === "short"
          ? await savePendingVideoDraft({ ...sourceDraft, status: "auth_required" })
          : await persistCurrentDraft("auth_required");
      if (!baseDraft) {
        console.warn("[draft-debug]", "queue_for_submission_missing_base_draft");
        throw new Error(translate("dashboard.shortVideo.chooseImageFirst"));
      }
      console.info("[draft-debug]", "draft_saved_for_submit", {
        draftId: baseDraft.id,
        status: baseDraft.status,
      });
      setEditorDraftId(baseDraft.id);

      try {
        await ensureSessionReady(accessToken, { signal });
        const readyDraft = await savePendingVideoDraft({ ...baseDraft, status: "ready" });
        console.info("[draft-debug]", "draft_ready_for_tasks_page", {
          draftId: readyDraft.id,
          status: readyDraft.status,
        });
        suspendDraftAutosaveRef.current = true;
        setRecoveryDraft(null);
        setEditorDraftId(readyDraft.id);
        console.info("[draft-debug]", "navigate_to_tasks_with_draft", { draftId: readyDraft.id });
        router.push(`/videos/tasks?draft=${encodeURIComponent(readyDraft.id)}`);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          suspendDraftAutosaveRef.current = false;
          const authRequiredDraft = await savePendingVideoDraft({ ...baseDraft, status: "auth_required" });
          console.warn("[draft-debug]", "queue_for_submission_auth_required", {
            draftId: authRequiredDraft.id,
          });
          setRecoveryDraft(authRequiredDraft);
          return;
        }
        suspendDraftAutosaveRef.current = false;
        console.error("[draft-debug]", "queue_for_submission_failed", error);
        throw error;
      }
    },
    [accessToken, editorDraftId, persistCurrentDraft, router, translate],
  );

  useEffect(() => {
    let cancelled = false;
    void getActivePendingVideoDraft(SHORT_DRAFT_SCOPE)
      .then((draft) => {
        if (cancelled) {
          return;
        }
        setRecoveryDraft(draft && draft.task_type === "short" ? draft : null);
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
    if (!bootstrapped || !recoveryChecked || creating || !imageFile || suspendDraftAutosaveRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistCurrentDraft("editing").catch(() => {
        // Keep autosave best-effort so editing is not interrupted by storage issues.
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bootstrapped, creating, imageFile, persistCurrentDraft, recoveryChecked]);

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
      const dragResult = resolveOverlayDragResult(
        baseX,
        baseY,
        stageRect.width,
        stageRect.height,
        overlayWidth,
        overlayHeight,
        margin,
      );
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
      const dragResult = resolveOverlayDragResult(
        baseX,
        baseY,
        stageRect.width,
        stageRect.height,
        overlaySize,
        overlaySize,
        margin,
      );
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
    if (targetStep === 1 && !imageFile) {
      return translate("dashboard.shortVideo.chooseImageFirst");
    }
    if (targetStep === 2 && !sceneTemplateId) {
      return translate("dashboard.shortVideo.chooseTemplateFirst");
    }
    if (targetStep === 3) {
      if (enableLogo && logos.length === 0) {
        return translate("dashboard.shortVideo.noLogoAvailable");
      }
      if (enableLogo && !selectedLogoKey) {
        return translate("dashboard.shortVideo.chooseLogoFirst");
      }
      if (enableAvatar && supportsAvatarOverlay && avatars.length === 0) {
        return translate("dashboard.shortVideo.avatarUploadFirst");
      }
      if (enableAvatar && supportsAvatarOverlay && !selectedAvatarKey) {
        return translate("dashboard.shortVideo.avatarChooseFirst");
      }
      if (enableProfileCard && supportsEndingProfileCard && profileCards.length === 0) {
        return translate("dashboard.shortVideo.profileCardCreateFirst");
      }
      if (enableProfileCard && supportsEndingProfileCard && !selectedProfileCardId) {
        return translate("dashboard.shortVideo.profileCardChooseFirst");
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
    console.info("[draft-debug]", "submit_clicked", {
      editorDraftId,
      step,
      hasImage: Boolean(imageFile),
      hasTemplate: Boolean(sceneTemplateId),
    });
    const error = validateWizardStep(1) ?? validateWizardStep(2) ?? validateWizardStep(3);
    if (error) {
      console.warn("[draft-debug]", "submit_blocked_by_validation", { error });
      setFormError(error);
      return;
    }
    if (!imageFile) {
      setFormError(translate("dashboard.shortVideo.chooseImageFirst"));
      return;
    }

    setCreating(true);
    clearMessages();
    const controller = new AbortController();
    submitAbortControllerRef.current = controller;
    try {
      await queueDraftForSubmission(undefined, controller.signal);
    } catch (err) {
      if (isAbortError(err)) {
        suspendDraftAutosaveRef.current = false;
        await persistCurrentDraft("editing");
        setFormMessage(translate("dashboard.shortVideo.createCancelled"));
        return;
      }
      if (err instanceof UnauthorizedError) {
        return;
      }
      setFormError(err instanceof Error ? err.message : translate("dashboard.shortVideo.createFailed"));
    } finally {
      submitAbortControllerRef.current = null;
      setCreating(false);
    }
  }

  async function handleOpenBillingForQuota() {
    const draft = await persistCurrentDraft("editing");
    const params = new URLSearchParams({
      returnTo: "/videos/create",
      resumeMode: "edit",
      taskType: "short",
    });
    if (draft?.id) {
      params.set("draft", draft.id);
    }
    router.push(`/billing?${params.toString()}`);
  }

  async function handleCancelCurrentTask() {
    submitAbortControllerRef.current?.abort();
    suspendDraftAutosaveRef.current = false;
    clearMessages();
    if (editorDraftId) {
      await deletePendingVideoDraft(editorDraftId);
    } else {
      await clearActivePendingVideoDraft(SHORT_DRAFT_SCOPE);
    }
    setRecoveryDraft(null);
    setEditorDraftId("");
    setStep(1);
    setImageFile(null);
    setEnableLogo(false);
    setLogoPlacement(CORNER_PLACEMENTS.bottom_right);
    setEnableAvatar(false);
    setAvatarPosition("bottom_right");
    setAvatarPlacement(CORNER_PLACEMENTS.bottom_right);
    setEnableProfileCard(false);
    setEditingOverlayTarget(null);
    setCreating(false);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    setFormMessage(translate("dashboard.shortVideo.taskCancelled"));
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
    if (!recoveryDraft || recoveryDraft.task_type !== "short") {
      return;
    }
    suspendDraftAutosaveRef.current = false;
    console.info("[draft-debug]", "recovery_resume_edit", {
      draftId: recoveryDraft.id,
      status: recoveryDraft.status,
    });
    clearMessages();
    restoreDraftIntoEditor(recoveryDraft);
    setRecoveryDraft(null);
    setFormMessage(translate("dashboard.shortVideo.draftRestored"));
  }

  async function handleDiscardDraft() {
    clearMessages();
    await clearActivePendingVideoDraft(SHORT_DRAFT_SCOPE);
    setRecoveryDraft(null);
    if (!imageFile) {
      setEditorDraftId("");
    }
  }

  if (!bootstrapped) {
    return <PageLoading text={translate("dashboard.shortVideo.loading")} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.shortVideo.title")}</h2>
          <p className="mt-2 text-sm text-gray-600">
            {translate("dashboard.shortVideo.wizardIntro")}
          </p>
        </div>

        {recoveryChecked && recoveryDraft ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-medium">{translate("dashboard.shortVideo.recoveryTitle")}</p>
            <p className="mt-1 text-amber-800">
              {translate(
                recoveryDraft.status === "auth_required"
                  ? "dashboard.shortVideo.recoveryAuthRequiredDescription"
                  : "dashboard.shortVideo.recoveryEditingDescription",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleResumeEditing()}
                className="rounded-full bg-white px-4 py-2 font-medium text-amber-900 shadow-sm ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
              >
                {translate("dashboard.shortVideo.recoveryContinueEditing")}
              </button>
              <button
                type="button"
                onClick={() => void handleDiscardDraft()}
                className="rounded-full px-4 py-2 font-medium text-amber-900 transition hover:bg-amber-100"
              >
                {translate("dashboard.shortVideo.recoveryDiscard")}
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{translate("dashboard.shortVideo.propertyImage")}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {translate("dashboard.shortVideo.uploadStepHint")}
                    </p>
                  </div>
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={(e) => {
                    clearMessages();
                    setImageFile(e.target.files?.[0] || null);
                  }}
                  className="hidden"
                />
                <div className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-white p-6">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {translate("dashboard.shortVideo.uploadImage")}
                  </button>
                  <p className="mt-3 text-xs text-gray-500">
                    {imageFile
                      ? translate("dashboard.accountPage.selectedFile", { name: imageFile.name })
                      : translate("dashboard.shortVideo.imageHint")}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-5">
                <p className="text-sm font-semibold text-gray-900">{translate("dashboard.shortVideo.selectedImageTitle")}</p>
                {imagePreviewUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-white">
                    <Image src={imagePreviewUrl} alt="Selected property" width={1200} height={720} className="h-72 w-full object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="mt-4 h-72 rounded-2xl border border-dashed bg-white" />
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-gray-50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.propertyTypeLabel")}</label>
                  <InfoTooltip text={translate("dashboard.shortVideo.propertyTypeHint")} ariaLabel={translate("common.moreInfo")} />
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

              <div className="space-y-5">
                <div className="rounded-2xl border bg-white p-5">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.templateLabel")}</label>
                  <select
                    value={sceneTemplateId}
                    onChange={(e) => {
                      clearMessages();
                      setSceneTemplateId(e.target.value);
                    }}
                    disabled={templates.length === 0}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    {templates.length === 0 ? (
                      <option value="">{translate("dashboard.shortVideo.noTemplatesForPropertyType")}</option>
                    ) : (
                      templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {getTemplateLabel(template)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border bg-white p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.resolutionLabel")}</label>
                      <InfoTooltip text={translate("dashboard.shortVideo.resolutionFixedHint")} ariaLabel={translate("common.moreInfo")} />
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      {translate("common.fixed1080p")}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.aspectRatioLabel")}</label>
                      <InfoTooltip text={translate("dashboard.shortVideo.aspectRatioFixedHint")} ariaLabel={translate("common.moreInfo")} />
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">16:9</div>
                  </div>
                  <div className="rounded-2xl border bg-white p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.durationLabel")}</label>
                      {!durationEditable ? <PlanBadge>Pro/Ultimate</PlanBadge> : null}
                      <InfoTooltip
                        text={`${translate("dashboard.shortVideo.basicDurationHint")} ${translate("dashboard.shortVideo.durationLockedHint")}`}
                        ariaLabel={translate("common.moreInfo")}
                      />
                    </div>
                    <select
                      value={effectiveDuration}
                      onChange={(e) => {
                        clearMessages();
                        setDurationSeconds(Number(e.target.value));
                      }}
                      disabled={!durationEditable}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {ALL_DURATIONS.map((value) => (
                        <option key={value} value={value} disabled={!durationEditable && value !== (fixedDuration || 4)}>
                          {durationEditable || value === (fixedDuration || 4)
                            ? translate("common.seconds", { value })
                            : `${translate("common.seconds", { value })} · ${translate("dashboard.shortVideo.unavailableOptionSuffix")}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <label className="mb-2 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.serviceTierLabel")}</label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setServiceTier("standard");
                      }}
                      className={`rounded-xl border px-4 py-3 text-left ${
                        serviceTier === "standard" ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{translate("dashboard.shortVideo.serviceTierStandardTitle")}</p>
                      <p className="mt-1 text-xs text-gray-500">{translate("dashboard.shortVideo.serviceTierStandardHint")}</p>
                    </button>
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-left opacity-60"
                    >
                      <p className="text-sm font-medium text-gray-900">{translate("dashboard.shortVideo.serviceTierFlexTitle")}</p>
                      <p className="mt-1 text-xs text-gray-500">{translate("dashboard.shortVideo.serviceTierFlexHint")}</p>
                      <p className="mt-2 text-xs font-medium text-gray-500">{translate("dashboard.shortVideo.serviceTierFlexDisabledHint")}</p>
                    </button>
                  </div>
                </div>
              </div>

              {!quota.can_purchase_quota_package && quota.access_tier === "signup_bonus" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {translate("dashboard.shortVideo.signupHint")}
                  <Link href="/billing" className="mx-1 font-medium underline">
                    {translate("dashboard.shortVideo.signupLink")}
                  </Link>
                  {translate("dashboard.shortVideo.signupHintTail")}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-medium">{translate("dashboard.shortVideo.advancedOverlayTitle")}</p>
                <p className="mt-1">{translate("dashboard.shortVideo.advancedOverlayDescription")}</p>
                <Link
                  href="/account/logos"
                  onClick={() => {
                    void persistCurrentDraft("editing");
                  }}
                  className="mt-2 inline-flex text-sm font-medium text-blue-700 underline"
                >
                  {translate("dashboard.shortVideo.openAssetsCenter")}
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
                                  <div className="font-medium">{translate("dashboard.shortVideo.logoPlacementTitle")}</div>
                                  <InfoTooltip text={translate("dashboard.shortVideo.overlayPlacementHelp")} ariaLabel={translate("common.moreInfo")} />
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
                            <p className="text-sm text-amber-700">{translate("dashboard.shortVideo.noLogoYet")}</p>
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
                        {translate("dashboard.shortVideo.addAvatarOverlay")}
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
                                  <div className="font-medium">{translate("dashboard.shortVideo.avatarPlacementTitle")}</div>
                                  <InfoTooltip text={translate("dashboard.shortVideo.overlayPlacementHelp")} ariaLabel={translate("common.moreInfo")} />
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
                              {translate("dashboard.shortVideo.goUploadAvatar")}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.addAvatarOverlay")}</span>
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
                        {translate("dashboard.shortVideo.addEndingProfileCard")}
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
                              {translate("dashboard.shortVideo.goCreateProfileCard")}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.addEndingProfileCard")}</span>
                      <PlanBadge>Pro/Ultimate</PlanBadge>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{translate("dashboard.shortVideo.overlayPreviewTitle")}</p>
                        <InfoTooltip
                          text={
                            canEditCurrentOverlay
                              ? translate("dashboard.shortVideo.overlayPreviewHintEditable")
                              : enableLogo
                                ? translate("dashboard.shortVideo.overlayPreviewHintFixed")
                                : translate("dashboard.shortVideo.overlayPreviewHintEmpty")
                          }
                          ariaLabel={translate("common.moreInfo")}
                        />
                      </div>
                    </div>
                    {editingOverlayTarget && (
                      <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {translate("dashboard.shortVideo.editingLabel")}: {formatOverlayEditorTargetLabel(translate, editingOverlayTarget)}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-100">
                    <div ref={overlayPreviewStageRef} className="relative aspect-video w-full">
                      {imagePreviewUrl ? (
                        <Image src={imagePreviewUrl} alt="Overlay editor preview background" fill unoptimized className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500">
                          Upload an image in step 1 to preview overlay placement.
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
                      <span className="font-medium text-gray-900">{translate("dashboard.shortVideo.editingLabel")}:</span>{" "}
                      {editingOverlayTarget
                        ? formatOverlayEditorTargetLabel(translate, editingOverlayTarget)
                        : translate("dashboard.shortVideo.noEditableOverlaySelected")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-900">{translate("dashboard.shortVideo.placementLabel")}:</span>{" "}
                      {currentOverlayPlacementLabel ?? (enableLogo ? translate("dashboard.shortVideo.fixedBottomRightBasic") : translate("dashboard.shortVideo.notSet"))}
                    </p>
                    {currentOverlayPlacement && canEditCurrentOverlay && (
                      <p className="text-xs text-gray-500">{translate("dashboard.shortVideo.overlayPlacementHelp")}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {formMessage && <p className="text-sm text-green-600">{formMessage}</p>}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {step === 3 && !canSubmitWithQuota && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">{translate("dashboard.billing.quotaInsufficientTitle")}</p>
              <p className="mt-1">
                {translate("dashboard.billing.quotaInsufficientSummary", {
                  required: requiredQuota,
                  available: availableQuota,
                })}
              </p>
              {quota.pending_reserved > 0 ? (
                <p className="mt-1 text-amber-800">
                  {translate("dashboard.billing.quotaPendingReservedHint", { count: quota.pending_reserved })}
                </p>
              ) : null}
              <p className="mt-1 text-amber-800">
                {availableQuota > 0
                  ? translate("dashboard.billing.quotaRemainingOptions", { count: availableQuota })
                  : translate("dashboard.billing.quotaRemainingOptionsZero")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {quota.can_purchase_quota_package ? (
                  <button
                    type="button"
                    onClick={() => void handleOpenBillingForQuota()}
                    className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    {translate("dashboard.billing.buyQuotaPackageAndReturn")}
                  </button>
                ) : null}
                <Link href="/billing" className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
                  {translate("dashboard.nav.billing")}
                </Link>
              </div>
            </div>
          )}

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
                disabled={creating || !canSubmitWithQuota}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating
                  ? translate("dashboard.shortVideo.creating")
                  : canSubmitWithQuota
                    ? translate("dashboard.shortVideo.create")
                    : translate("dashboard.shortVideo.noQuota")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCancelCurrentTask()}
              className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {translate("dashboard.shortVideo.cancelTask")}
            </button>
            <Link href="/videos/tasks" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
              {translate("common.backToTasks")}
            </Link>
          </div>
        </form>
      </section>
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

function PageLoading({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
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

