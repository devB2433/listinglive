"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import {
  createProfileCard,
  deleteAvatar,
  deleteLogo,
  deleteProfileCard,
  getProfileCardDraftPreviewBlob,
  type ProfileCardTemplateKey,
  setDefaultAvatar,
  setDefaultLogo,
  type ProfileCard,
  type UpsertProfileCardBody,
  type UserAvatar,
  type UserLogo,
  updateProfileCard,
  uploadVideoAsset,
} from "@/lib/api";
import {
  getCachedProfileCards,
  getCachedUserAvatars,
  getCachedUserLogos,
  invalidateProfileCardsCache,
  invalidateUserAvatarsCache,
  invalidateUserLogosCache,
} from "@/lib/video-config-cache";

const PROFILE_CARD_TEMPLATES: Array<{
  key: ProfileCardTemplateKey;
}> = [
  { key: "clean_light" },
  { key: "brand_dark" },
  { key: "agent_focus" },
];
const AVAILABLE_PROFILE_CARD_TEMPLATE_KEYS = new Set<ProfileCardTemplateKey>(["brand_dark"]);

const AVATAR_CROP_STAGE_SIZE = 220;
const AVATAR_CROP_MIN_ZOOM = 1;
const AVATAR_CROP_MAX_ZOOM = 2.4;
const AUTOFILL_IGNORE_PROPS = {
  autoComplete: "off",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
} as const;

export default function AccountLogosPage() {
  const { accessToken } = useDashboardSession();
  const { translate } = useLocale();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [avatars, setAvatars] = useState<UserAvatar[]>([]);
  const [profileCards, setProfileCards] = useState<ProfileCard[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoName, setLogoName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarName, setAvatarName] = useState("");
  const [avatarSourceUrl, setAvatarSourceUrl] = useState("");
  const [avatarCropRect, setAvatarCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [avatarCropZoom, setAvatarCropZoom] = useState(1);
  const [avatarCropBaseSize, setAvatarCropBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [draggingAvatarCrop, setDraggingAvatarCrop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busyLogoId, setBusyLogoId] = useState("");
  const [busyAvatarId, setBusyAvatarId] = useState("");
  const [busyProfileCardId, setBusyProfileCardId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cardId, setCardId] = useState("");
  const [cardDisplayName, setCardDisplayName] = useState(() => translate("dashboard.accountPage.defaultCardName"));
  const [cardTemplateKey, setCardTemplateKey] = useState<ProfileCardTemplateKey>("brand_dark");
  const [cardFullName, setCardFullName] = useState("");
  const [cardSlogan, setCardSlogan] = useState("");
  const [cardPhone, setCardPhone] = useState("");
  const [cardAddress, setCardAddress] = useState("");
  const [cardHomepage, setCardHomepage] = useState("");
  const [cardEmail, setCardEmail] = useState("");
  const [cardBrokerageName, setCardBrokerageName] = useState("");
  const [cardAvatarId, setCardAvatarId] = useState("");
  const [profileCardPreviewUrl, setProfileCardPreviewUrl] = useState("");
  const [profileCardPreviewLoading, setProfileCardPreviewLoading] = useState(false);
  const previewUrlRef = useRef("");
  const avatarSourceUrlRef = useRef("");
  const avatarCropImageRef = useRef<HTMLImageElement | null>(null);
  const avatarDragCleanupRef = useRef<(() => void) | null>(null);

  const loadCardIntoEditor = useCallback((card: ProfileCard) => {
    setCardId(card.id);
    setCardDisplayName(card.display_name);
    setCardTemplateKey(normalizeProfileCardTemplateKey(card.template_key));
    setCardFullName(card.full_name);
    setCardSlogan(card.slogan);
    setCardPhone(card.phone);
    setCardAddress(card.contact_address);
    setCardHomepage(card.homepage);
    setCardEmail(card.email);
    setCardBrokerageName(card.brokerage_name);
    setCardAvatarId(card.avatar_asset_id || "");
  }, []);

  const buildProfileCardDraftBody = useCallback((): UpsertProfileCardBody | null => {
    if (
      !cardDisplayName.trim() ||
      !cardFullName.trim() ||
      !cardPhone.trim() ||
      !cardAddress.trim() ||
      !cardHomepage.trim() ||
      !cardEmail.trim()
    ) {
      return null;
    }
    return {
      display_name: cardDisplayName.trim(),
      template_key: cardTemplateKey,
      full_name: cardFullName.trim(),
      slogan: cardSlogan.trim(),
      phone: cardPhone.trim(),
      contact_address: cardAddress.trim(),
      homepage: cardHomepage.trim(),
      email: cardEmail.trim(),
      brokerage_name: cardBrokerageName.trim(),
      avatar_asset_id: cardAvatarId || null,
      logo_asset_id: null,
      is_default: true,
      show_avatar_default: true,
      show_name_default: true,
      show_phone_default: true,
      show_address_default: true,
      show_brokerage_default: true,
      show_logo_default: false,
    };
  }, [cardAddress, cardAvatarId, cardBrokerageName, cardDisplayName, cardEmail, cardFullName, cardHomepage, cardPhone, cardSlogan, cardTemplateKey]);

  useEffect(() => {
    Promise.all([
      getCachedUserLogos(accessToken),
      getCachedUserAvatars(accessToken),
      getCachedProfileCards(accessToken),
    ])
      .then(([logoData, avatarData, profileCardData]) => {
        setLogos(logoData);
        setAvatars(avatarData);
        setProfileCards(profileCardData);
        const defaultCard = profileCardData.find((item) => item.is_default) || profileCardData[0];
        if (defaultCard) {
          loadCardIntoEditor(defaultCard);
        }
      })
      .finally(() => setLoading(false));
  }, [accessToken, loadCardIntoEditor]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      if (avatarSourceUrlRef.current) {
        URL.revokeObjectURL(avatarSourceUrlRef.current);
      }
      avatarDragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!avatarFile) {
      if (avatarSourceUrlRef.current) {
        URL.revokeObjectURL(avatarSourceUrlRef.current);
        avatarSourceUrlRef.current = "";
      }
      setAvatarSourceUrl("");
      setAvatarCropRect(null);
      setAvatarCropBaseSize(null);
      setAvatarCropZoom(1);
      return;
    }
    const nextUrl = URL.createObjectURL(avatarFile);
    if (avatarSourceUrlRef.current) {
      URL.revokeObjectURL(avatarSourceUrlRef.current);
    }
    avatarSourceUrlRef.current = nextUrl;
    setAvatarSourceUrl(nextUrl);
    setAvatarCropRect(null);
    setAvatarCropBaseSize(null);
    setAvatarCropZoom(1);
  }, [avatarFile]);

  useEffect(() => {
    let active = true;
    const body = buildProfileCardDraftBody();
    if (!body) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      setProfileCardPreviewUrl("");
      setProfileCardPreviewLoading(false);
      return () => {
        active = false;
      };
    }
    setProfileCardPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void getProfileCardDraftPreviewBlob(accessToken, body)
        .then((blob) => {
          if (!active) {
            return;
          }
          const nextUrl = URL.createObjectURL(blob);
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
          }
          previewUrlRef.current = nextUrl;
          setProfileCardPreviewUrl(nextUrl);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = "";
          }
          setProfileCardPreviewUrl("");
        })
        .finally(() => {
          if (active) {
            setProfileCardPreviewLoading(false);
          }
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, buildProfileCardDraftBody]);

  async function reloadLogos() {
    const latestLogos = await getCachedUserLogos(accessToken, { force: true });
    setLogos(latestLogos);
  }

  async function reloadAvatars() {
    const latestAvatars = await getCachedUserAvatars(accessToken, { force: true });
    setAvatars(latestAvatars);
  }

  async function reloadProfileCards() {
    const latestCards = await getCachedProfileCards(accessToken, { force: true });
    setProfileCards(latestCards);
  }

  async function handleUploadLogo() {
    if (!logoFile) {
      setError(translate("dashboard.accountPage.chooseLogoFirst"));
      return;
    }
    if (!logoName.trim()) {
      setError(translate("dashboard.accountPage.enterLogoName"));
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      await uploadVideoAsset(accessToken, logoFile, "logo", { name: logoName.trim() });
      invalidateUserLogosCache(accessToken);
      await reloadLogos();
      setLogoFile(null);
      setLogoName("");
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
      setMessage(translate("dashboard.accountPage.logoUploadSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.logoUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSetDefault(logoId: string) {
    setBusyLogoId(logoId);
    setError("");
    setMessage("");
    try {
      await setDefaultLogo(accessToken, logoId);
      invalidateUserLogosCache(accessToken);
      await reloadLogos();
      setMessage(translate("dashboard.accountPage.defaultUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.defaultUpdateFailed"));
    } finally {
      setBusyLogoId("");
    }
  }

  async function handleUploadAvatar() {
    if (!avatarFile) {
      setError(translate("dashboard.accountPage.chooseAvatarFirst"));
      return;
    }
    if (!avatarName.trim()) {
      setError(translate("dashboard.accountPage.enterAvatarName"));
      return;
    }

    setUploadingAvatar(true);
    setError("");
    setMessage("");
    try {
      const processedAvatar = await buildAvatarUploadFile(avatarFile, avatarCropRect);
      await uploadVideoAsset(accessToken, processedAvatar, "avatar", { name: avatarName.trim() });
      invalidateUserAvatarsCache(accessToken);
      await reloadAvatars();
      setAvatarFile(null);
      setAvatarName("");
      setAvatarCropRect(null);
      setAvatarCropBaseSize(null);
      setAvatarCropZoom(1);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      setMessage(translate("dashboard.accountPage.avatarUploadSuccess"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.startsWith("dashboard.accountPage.")
            ? translate(err.message)
            : err.message
          : translate("dashboard.accountPage.avatarUploadFailed"),
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleAvatarImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    avatarCropImageRef.current = image;
    const nextRect = buildAvatarCoverRect(image.naturalWidth, image.naturalHeight);
    setAvatarCropBaseSize({ width: nextRect.width, height: nextRect.height });
    setAvatarCropRect(nextRect);
    setAvatarCropZoom(1);
  }

  function startAvatarCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!avatarCropRect) {
      return;
    }
    event.preventDefault();
    avatarDragCleanupRef.current?.();
    setDraggingAvatarCrop(true);
    const startPointer = { x: event.clientX, y: event.clientY };
    const startRect = avatarCropRect;
    const minX = AVATAR_CROP_STAGE_SIZE - startRect.width;
    const minY = AVATAR_CROP_STAGE_SIZE - startRect.height;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startPointer.x;
      const deltaY = moveEvent.clientY - startPointer.y;
      setAvatarCropRect({
        ...startRect,
        x: clamp(startRect.x + deltaX, minX, 0),
        y: clamp(startRect.y + deltaY, minY, 0),
      });
    };
    const handlePointerUp = () => {
      cleanup();
      setDraggingAvatarCrop(false);
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

  function handleAvatarZoomChange(nextZoomValue: number) {
    setAvatarCropZoom(nextZoomValue);
    setAvatarCropRect((currentRect) => {
      if (!currentRect || !avatarCropBaseSize) {
        return currentRect;
      }
      const centerX = currentRect.x + currentRect.width / 2;
      const centerY = currentRect.y + currentRect.height / 2;
      const nextWidth = avatarCropBaseSize.width * nextZoomValue;
      const nextHeight = avatarCropBaseSize.height * nextZoomValue;
      return clampAvatarRectToStage({
        x: centerX - nextWidth / 2,
        y: centerY - nextHeight / 2,
        width: nextWidth,
        height: nextHeight,
      });
    });
  }

  async function handleSetDefaultAvatar(avatarId: string) {
    setBusyAvatarId(avatarId);
    setError("");
    setMessage("");
    try {
      await setDefaultAvatar(accessToken, avatarId);
      invalidateUserAvatarsCache(accessToken);
      await reloadAvatars();
      setMessage(translate("dashboard.accountPage.avatarDefaultUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.avatarDefaultUpdateFailed"));
    } finally {
      setBusyAvatarId("");
    }
  }

  async function handleDeleteAvatar(avatarId: string) {
    setBusyAvatarId(avatarId);
    setError("");
    setMessage("");
    try {
      await deleteAvatar(accessToken, avatarId);
      invalidateUserAvatarsCache(accessToken);
      invalidateProfileCardsCache(accessToken);
      await reloadAvatars();
      await reloadProfileCards();
      if (cardAvatarId === avatarId) {
        setCardAvatarId("");
      }
      setMessage(translate("dashboard.accountPage.avatarDeleted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.avatarDeleteFailed"));
    } finally {
      setBusyAvatarId("");
    }
  }

  async function handleSaveProfileCard() {
    if (!cardDisplayName.trim() || !cardFullName.trim() || !cardPhone.trim() || !cardAddress.trim() || !cardHomepage.trim() || !cardEmail.trim()) {
      setError(translate("dashboard.accountPage.profileCardFormIncomplete"));
      return;
    }
    setBusyProfileCardId(cardId || "new");
    setError("");
    setMessage("");
    try {
      const body: UpsertProfileCardBody = {
        display_name: cardDisplayName.trim(),
        template_key: cardTemplateKey,
        full_name: cardFullName.trim(),
        slogan: cardSlogan.trim(),
        phone: cardPhone.trim(),
        contact_address: cardAddress.trim(),
        homepage: cardHomepage.trim(),
        email: cardEmail.trim(),
        brokerage_name: cardBrokerageName.trim(),
        avatar_asset_id: cardAvatarId || null,
        logo_asset_id: null,
        is_default: true,
        show_avatar_default: true,
        show_name_default: true,
        show_phone_default: true,
        show_address_default: true,
        show_brokerage_default: true,
        show_logo_default: false,
      };
      const saved = cardId
        ? await updateProfileCard(accessToken, cardId, body)
        : await createProfileCard(accessToken, body);
      setCardId(saved.id);
      invalidateProfileCardsCache(accessToken);
      await reloadProfileCards();
      setMessage(translate("dashboard.accountPage.profileCardSaveSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.profileCardSaveFailed"));
    } finally {
      setBusyProfileCardId("");
    }
  }

  async function handleDeleteProfileCard(profileCardId: string) {
    setBusyProfileCardId(profileCardId);
    setError("");
    setMessage("");
    try {
      await deleteProfileCard(accessToken, profileCardId);
      invalidateProfileCardsCache(accessToken);
      await reloadProfileCards();
      if (cardId === profileCardId) {
        setCardId("");
        setCardDisplayName(translate("dashboard.accountPage.defaultCardName"));
        setCardTemplateKey("brand_dark");
        setCardFullName("");
        setCardSlogan("");
        setCardPhone("");
        setCardAddress("");
        setCardHomepage("");
        setCardEmail("");
        setCardBrokerageName("");
        setCardAvatarId("");
      }
      setMessage(translate("dashboard.accountPage.profileCardDeleteSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.profileCardDeleteFailed"));
    } finally {
      setBusyProfileCardId("");
    }
  }

  async function handleDelete(logoId: string) {
    setBusyLogoId(logoId);
    setError("");
    setMessage("");
    try {
      await deleteLogo(accessToken, logoId);
      invalidateUserLogosCache(accessToken);
      await reloadLogos();
      setMessage(translate("dashboard.accountPage.logoDeleted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("dashboard.accountPage.logoDeleteFailed"));
    } finally {
      setBusyLogoId("");
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-500">{translate("dashboard.accountPage.loading")}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.accountPage.logoTitle")}</h2>
      <p className="mt-2 text-sm text-gray-600">{translate("dashboard.accountPage.logoSubtitle")}</p>

      <div className="mt-4 rounded-xl border bg-gray-50 p-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.accountPage.logoNameLabel")}</label>
        <input
          type="text"
          value={logoName}
          onChange={(e) => setLogoName(e.target.value)}
          {...AUTOFILL_IGNORE_PROPS}
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder={translate("dashboard.accountPage.logoNamePlaceholder")}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
          >
            {translate("common.uploadLogo")}
          </button>
          <button
            type="button"
            onClick={() => void handleUploadLogo()}
            disabled={uploading || !logoFile}
            className="rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {uploading ? translate("common.uploading") : translate("dashboard.accountPage.confirmUpload")}
          </button>
          <p className="text-xs text-gray-500">
            {logoFile
              ? translate("dashboard.accountPage.selectedFile", { name: logoFile.name })
              : translate("dashboard.accountPage.supportTypes")}
          </p>
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{translate("dashboard.accountPage.uploadedLogos")}</h3>
        {logos.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">{translate("dashboard.accountPage.noLogos")}</div>
        )}
        {logos.map((logo) => (
          <div key={logo.key} className="rounded-xl border p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{logo.name}</p>
                  {logo.is_default && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{translate("common.default")}</span>
                  )}
                </div>
                <p className="mt-1 break-all text-xs text-gray-500">{logo.key}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!logo.is_default && (
                  <button
                    type="button"
                    onClick={() => void handleSetDefault(logo.id)}
                    disabled={busyLogoId === logo.id}
                    className="rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {translate("dashboard.accountPage.setDefault")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(logo.id)}
                  disabled={busyLogoId === logo.id}
                  className="rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {translate("common.delete")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">{translate("dashboard.accountPage.avatarSectionTitle")}</h3>
        <input
          type="text"
          value={avatarName}
          onChange={(e) => setAvatarName(e.target.value)}
          {...AUTOFILL_IGNORE_PROPS}
          className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder={translate("dashboard.accountPage.avatarNamePlaceholder")}
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const nextFile = e.target.files?.[0] || null;
            setAvatarFile(nextFile);
            if (nextFile && !avatarName.trim()) {
              setAvatarName(nextFile.name.replace(/\.[^.]+$/, ""));
            }
          }}
          className="hidden"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
          >
            {translate("dashboard.accountPage.uploadAvatar")}
          </button>
          <button
            type="button"
            onClick={() => void handleUploadAvatar()}
            disabled={uploadingAvatar || !avatarFile}
            className="rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {uploadingAvatar ? translate("common.uploading") : translate("dashboard.accountPage.confirmUpload")}
          </button>
          <p className="text-xs text-gray-500">
            {avatarFile ? translate("dashboard.accountPage.selectedFile", { name: avatarFile.name }) : translate("dashboard.accountPage.supportTypes")}
          </p>
        </div>
        {avatarSourceUrl && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="rounded-2xl border bg-white p-4">
              <p className="text-sm font-medium text-gray-900">{translate("dashboard.accountPage.avatarCropPreviewTitle")}</p>
              <p className="mt-1 text-xs text-gray-500">{translate("dashboard.accountPage.avatarCropPreviewDescription")}</p>
              <div className="mt-4 flex justify-center">
                <div
                  className={`relative overflow-hidden rounded-full border-2 border-dashed border-blue-300 bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] shadow-inner ${
                    draggingAvatarCrop ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ width: AVATAR_CROP_STAGE_SIZE, height: AVATAR_CROP_STAGE_SIZE }}
                  onPointerDown={startAvatarCropDrag}
                >
                  {avatarCropRect && (
                    <Image
                      src={avatarSourceUrl}
                      alt={translate("dashboard.accountPage.avatarCropPreviewAlt")}
                      unoptimized
                      width={Math.round(avatarCropRect.width)}
                      height={Math.round(avatarCropRect.height)}
                      className="pointer-events-none absolute max-w-none select-none"
                      style={{
                        left: avatarCropRect.x,
                        top: avatarCropRect.y,
                        width: avatarCropRect.width,
                        height: avatarCropRect.height,
                      }}
                    />
                  )}
                  {!avatarCropRect && (
                    <Image
                      src={avatarSourceUrl}
                      alt={translate("dashboard.accountPage.avatarCropSourceAlt")}
                      unoptimized
                      fill
                      onLoad={handleAvatarImageLoad}
                      className="pointer-events-none object-contain opacity-0"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{translate("dashboard.accountPage.zoomLabel")}</span>
                  <span>{avatarCropZoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={AVATAR_CROP_MIN_ZOOM}
                  max={AVATAR_CROP_MAX_ZOOM}
                  step={0.01}
                  value={avatarCropZoom}
                  onChange={(e) => handleAvatarZoomChange(Number(e.target.value))}
                  {...AUTOFILL_IGNORE_PROPS}
                  className="mt-2 w-full"
                />
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <p className="text-sm font-medium text-gray-900">{translate("dashboard.accountPage.finalOverlayBehaviorTitle")}</p>
              <ul className="mt-2 space-y-2 text-xs text-gray-500">
                <li>{translate("dashboard.accountPage.finalOverlayBehaviorRule1")}</li>
                <li>{translate("dashboard.accountPage.finalOverlayBehaviorRule2")}</li>
                <li>{translate("dashboard.accountPage.finalOverlayBehaviorRule3")}</li>
              </ul>
            </div>
          </div>
        )}
        <div className="mt-4 space-y-3">
          {avatars.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">{translate("dashboard.accountPage.noAvatars")}</div>}
          {avatars.map((avatar) => (
            <div key={avatar.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{avatar.name}</p>
                    {avatar.is_default && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{translate("common.default")}</span>}
                  </div>
                  <p className="mt-1 break-all text-xs text-gray-500">{avatar.key}</p>
                </div>
                <div className="flex gap-2">
                  {!avatar.is_default && (
                    <button
                      type="button"
                      onClick={() => void handleSetDefaultAvatar(avatar.id)}
                      disabled={busyAvatarId === avatar.id}
                      className="rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {translate("dashboard.accountPage.setDefault")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteAvatar(avatar.id)}
                    disabled={busyAvatarId === avatar.id}
                    className="rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {translate("common.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-xl border bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">{translate("dashboard.accountPage.profileCardSectionTitle")}</h3>
        <p className="mt-2 text-sm text-gray-600">
          {translate("dashboard.accountPage.profileCardSectionDescription")}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PROFILE_CARD_TEMPLATES.map((template) => {
            const isAvailable = AVAILABLE_PROFILE_CARD_TEMPLATE_KEYS.has(template.key);
            const meta = getProfileCardTemplateMeta(translate, template.key);
            const isSelected = cardTemplateKey === template.key;
            return (
              <button
                key={template.key}
                type="button"
                onClick={() => {
                  if (!isAvailable) {
                    return;
                  }
                  setCardTemplateKey(template.key);
                }}
                disabled={!isAvailable}
                className={`rounded-2xl border p-4 text-left transition ${
                  isSelected ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
                } ${!isAvailable ? "cursor-not-allowed opacity-60" : ""}`}
                aria-disabled={!isAvailable}
                title={!isAvailable ? translate("dashboard.accountPage.inDevelopment") : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">{meta.title}</span>
                  {!isAvailable && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      {translate("dashboard.accountPage.inDevelopment")}
                    </span>
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <ProfileCardTemplatePreview templateKey={template.key} />
                </div>
                <p className="mt-3 text-xs text-gray-500">{meta.description}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={cardDisplayName} onChange={(e) => setCardDisplayName(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.cardNamePlaceholder")} />
          <input value={cardFullName} onChange={(e) => setCardFullName(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.fullNamePlaceholder")} />
          <input value={cardSlogan} onChange={(e) => setCardSlogan(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.sloganPlaceholder")} />
          <input value={cardPhone} onChange={(e) => setCardPhone(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.phonePlaceholder")} />
          <input value={cardHomepage} onChange={(e) => setCardHomepage(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.homepagePlaceholder")} />
          <input value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.emailPlaceholder")} />
          <input value={cardBrokerageName} onChange={(e) => setCardBrokerageName(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.brokeragePlaceholder")} />
        </div>
        <textarea value={cardAddress} onChange={(e) => setCardAddress(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={translate("dashboard.accountPage.addressPlaceholder")} rows={3} />
        <div className="mt-3 grid gap-3 md:grid-cols-1">
          <select value={cardAvatarId} onChange={(e) => setCardAvatarId(e.target.value)} {...AUTOFILL_IGNORE_PROPS} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">{translate("dashboard.accountPage.noAvatarOption")}</option>
            {avatars.map((avatar) => (
              <option key={avatar.id} value={avatar.id}>{avatar.name}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSaveProfileCard()}
            disabled={busyProfileCardId === (cardId || "new")}
            className="rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {translate("dashboard.accountPage.profileCardSave")}
          </button>
        </div>
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{translate("dashboard.accountPage.profileCardPreviewTitle")}</p>
              <p className="mt-1 text-xs text-gray-500">{translate("dashboard.accountPage.profileCardPreviewDescription")}</p>
            </div>
            {!profileCardPreviewLoading && <span className="text-xs text-gray-400">{translate("dashboard.accountPage.livePreview")}</span>}
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border bg-gray-100">
            <div className="relative aspect-video w-full">
              {profileCardPreviewUrl ? (
                <Image
                  src={profileCardPreviewUrl}
                  alt={translate("dashboard.accountPage.profileCardPreviewAlt")}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
                  {profileCardPreviewLoading ? translate("dashboard.accountPage.profileCardPreviewRendering") : translate("dashboard.accountPage.profileCardPreviewEmpty")}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {profileCards.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">{translate("dashboard.accountPage.noProfileCards")}</div>}
          {profileCards.map((card) => (
            <div key={card.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{card.display_name}</p>
                    {card.is_default && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{translate("common.default")}</span>}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{card.full_name}{card.slogan ? ` · ${card.slogan}` : ""}</p>
                  <p className="mt-1 text-xs text-gray-400">{card.phone} · {card.email}</p>
                  <p className="mt-1 text-xs text-gray-400">{getProfileCardTemplateMeta(translate, card.template_key).title}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadCardIntoEditor(card)}
                    className="rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    {translate("dashboard.accountPage.editProfileCard")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteProfileCard(card.id)}
                    disabled={busyProfileCardId === card.id}
                    className="rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {translate("common.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProfileCardTemplatePreview({ templateKey }: { templateKey: ProfileCardTemplateKey }) {
  if (templateKey === "brand_dark") {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl bg-[#232536] p-3 text-white">
        <div className="absolute inset-1 border-2 border-[#e8a42c]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-3 w-24 rounded bg-white/90" />
              <div className="mt-2 h-2.5 w-16 rounded bg-[#e8a42c]" />
              <div className="mt-3 h-2.5 w-24 rounded bg-[#eadfc8]/80" />
            </div>
            <div className="h-10 w-10 rounded-full border-2 border-[#e8a42c] bg-white/10" />
          </div>
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 bg-[#e8a42c]" />
                <div className="h-2.5 w-16 rounded bg-white/80" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 bg-[#e8a42c]" />
                <div className="h-2.5 w-20 rounded bg-white/70" />
              </div>
            </div>
            <div className="relative h-12 w-16">
              <div className="absolute inset-x-2 bottom-0 top-2 border-[3px] border-b-0 border-[#e8a42c]" />
              <div className="absolute inset-y-2 left-5 w-[2px] bg-white/80" />
              <div className="absolute inset-y-3 left-8 w-[2px] bg-white/80" />
              <div className="absolute inset-y-2 right-5 w-[2px] bg-white/80" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (templateKey === "agent_focus") {
    return (
      <div className="flex h-24 overflow-hidden rounded-xl border bg-white">
        <div className="flex w-20 items-center justify-center bg-blue-800">
          <div className="h-10 w-10 rounded-full bg-blue-200" />
        </div>
        <div className="flex-1 p-3">
          <div className="h-3 w-20 rounded bg-gray-900" />
          <div className="mt-2 h-2.5 w-24 rounded bg-blue-500/60" />
          <div className="mt-4 h-8 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }
  return (
    <div className="h-24 rounded-xl border bg-white p-3">
      <div className="h-3 w-20 rounded-full bg-blue-600/80" />
      <div className="mt-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-gray-900" />
          <div className="h-2.5 w-24 rounded bg-gray-300" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-blue-50" />
        <div className="h-6 w-24 rounded-full bg-gray-100" />
      </div>
    </div>
  );
}

function getProfileCardTemplateMeta(
  translate: (key: string, params?: Record<string, string | number>) => string,
  templateKey: ProfileCardTemplateKey,
) {
  const metaByKey: Record<ProfileCardTemplateKey, { title: string; description: string }> = {
    clean_light: {
      title: translate("dashboard.accountPage.profileCardTemplateCleanLightTitle"),
      description: translate("dashboard.accountPage.profileCardTemplateCleanLightDescription"),
    },
    brand_dark: {
      title: translate("dashboard.accountPage.profileCardTemplateBrandDarkTitle"),
      description: translate("dashboard.accountPage.profileCardTemplateBrandDarkDescription"),
    },
    agent_focus: {
      title: translate("dashboard.accountPage.profileCardTemplateAgentFocusTitle"),
      description: translate("dashboard.accountPage.profileCardTemplateAgentFocusDescription"),
    },
  };
  return metaByKey[templateKey] ?? metaByKey.brand_dark;
}

function normalizeProfileCardTemplateKey(templateKey: ProfileCardTemplateKey) {
  return AVAILABLE_PROFILE_CARD_TEMPLATE_KEYS.has(templateKey) ? templateKey : "brand_dark";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildAvatarCoverRect(sourceWidth: number, sourceHeight: number) {
  const scale = Math.max(AVATAR_CROP_STAGE_SIZE / Math.max(sourceWidth, 1), AVATAR_CROP_STAGE_SIZE / Math.max(sourceHeight, 1));
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return clampAvatarRectToStage({
    x: (AVATAR_CROP_STAGE_SIZE - width) / 2,
    y: (AVATAR_CROP_STAGE_SIZE - height) / 2,
    width,
    height,
  });
}

function clampAvatarRectToStage(rect: { x: number; y: number; width: number; height: number }) {
  return {
    ...rect,
    x: clamp(rect.x, AVATAR_CROP_STAGE_SIZE - rect.width, 0),
    y: clamp(rect.y, AVATAR_CROP_STAGE_SIZE - rect.height, 0),
  };
}

async function buildAvatarUploadFile(
  file: File,
  cropRect: { x: number; y: number; width: number; height: number } | null,
) {
  const image = await loadImageElement(file);
  const sourceRect = cropRect ?? buildAvatarCoverRect(image.naturalWidth, image.naturalHeight);
  const canvasSize = 512;
  const scaleRatio = canvasSize / AVATAR_CROP_STAGE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("dashboard.accountPage.avatarCropUnsupported");
  }

  context.clearRect(0, 0, canvasSize, canvasSize);
  context.save();
  context.beginPath();
  context.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(
    image,
    sourceRect.x * scaleRatio,
    sourceRect.y * scaleRatio,
    sourceRect.width * scaleRatio,
    sourceRect.height * scaleRatio,
  );
  context.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error("dashboard.accountPage.avatarExportFailed"));
        return;
      }
      resolve(nextBlob);
    }, "image/png");
  });

  const outputName = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${outputName}.png`, { type: "image/png" });
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("dashboard.accountPage.avatarLoadFailed"));
      image.src = objectUrl;
    });
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
