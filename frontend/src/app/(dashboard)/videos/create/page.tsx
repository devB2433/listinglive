"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import {
  type SceneTemplate,
  type SceneTemplatePropertyType,
  type UserLogo,
} from "@/lib/api";
import { useDashboardSession } from "@/components/providers/session-provider";
import { getAccessTierLabel } from "@/lib/capabilities";
import { getSceneTemplateDisplayName } from "@/lib/locale";
import { createPendingShortVideoDraft } from "@/lib/pending-video-task";
import { getCachedSceneTemplates, getCachedUserLogos } from "@/lib/video-config-cache";

const ALL_DURATIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const PROPERTY_TYPE_OPTIONS: SceneTemplatePropertyType[] = ["standard_home", "luxury_home", "apartment_rental"];

export default function VideoCreatePage() {
  const { accessToken, quota } = useDashboardSession();
  const { translate } = useLocale();
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [enableLogo, setEnableLogo] = useState(false);
  const [selectedLogoKey, setSelectedLogoKey] = useState("");
  const [sceneTemplateId, setSceneTemplateId] = useState("");
  const resolution = "1080p" as const;
  const aspectRatio = "16:9" as const;
  const [durationSeconds, setDurationSeconds] = useState(2);
  const [serviceTier, setServiceTier] = useState<"standard" | "flex">("standard");
  const [propertyType, setPropertyType] = useState<SceneTemplatePropertyType>("standard_home");

  const fixedDuration = quota.limits.short_fixed_duration_seconds;
  const durationEditable = quota.limits.short_duration_editable;
  const getTemplateLabel = (template: SceneTemplate) =>
    getSceneTemplateDisplayName(translate, template.template_key, template.name);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCachedSceneTemplates(accessToken, "short", { propertyType }),
      getCachedUserLogos(accessToken),
    ])
      .then(([templateData, logoData]) => {
        if (cancelled) return;
        setTemplates(templateData);
        setLogos(logoData);
        const defaultLogo = logoData.find((item) => item.is_default) || logoData[0];
        setSceneTemplateId((current) =>
          current && templateData.some((template) => template.id === current) ? current : (templateData[0]?.id ?? ""),
        );
        setSelectedLogoKey((current) =>
          current && logoData.some((logo) => logo.key === current) ? current : (defaultLogo?.key ?? ""),
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

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile) {
      setFormError(translate("dashboard.shortVideo.chooseImageFirst"));
      return;
    }
    if (!sceneTemplateId) {
      setFormError(translate("dashboard.shortVideo.chooseTemplateFirst"));
      return;
    }
    if (enableLogo && logos.length === 0) {
      setFormError(translate("dashboard.shortVideo.noLogoAvailable"));
      return;
    }
    if (enableLogo && !selectedLogoKey) {
      setFormError(translate("dashboard.shortVideo.chooseLogoFirst"));
      return;
    }

    setCreating(true);
    setFormError("");
    setFormMessage("");
    try {
      const draft = createPendingShortVideoDraft({
        image_file: imageFile,
        scene_template_id: sceneTemplateId,
        resolution,
        aspect_ratio: aspectRatio,
        duration_seconds: durationEditable ? durationSeconds : fixedDuration || durationSeconds,
        logo_key: enableLogo ? selectedLogoKey : null,
        service_tier: serviceTier,
      });
      router.push(`/videos/tasks?draft=${encodeURIComponent(draft.id)}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : translate("dashboard.shortVideo.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  if (!bootstrapped) {
    return <PageLoading text={translate("dashboard.shortVideo.loading")} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.shortVideo.title")}</h2>
          </div>
          <div className="space-y-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <p>{translate("dashboard.shortVideo.totalQuota", { count: quota.total_available })}</p>
            <p>{translate("dashboard.header.currentPermission", { value: getAccessTierLabel(translate, quota.access_tier) })}</p>
          </div>
        </div>

        <form onSubmit={handleCreateTask} className="mt-6 space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.propertyImage")}</label>
            <input
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {translate("dashboard.shortVideo.uploadImage")}
            </button>
            <p className="mt-1 text-xs text-gray-500">
              {imageFile
                ? translate("dashboard.accountPage.selectedFile", { name: imageFile.name })
                : translate("dashboard.shortVideo.imageHint")}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.logoLabel")}</label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={enableLogo}
                onChange={(e) => setEnableLogo(e.target.checked)}
              />
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
                    <p className="text-sm text-amber-700">{translate("dashboard.shortVideo.noLogoYet")}</p>
                    <Link href="/account/logos" className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50">
                      {translate("dashboard.shortVideo.goUploadLogo")}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.propertyTypeLabel")}</label>
            <p className="mb-3 text-xs text-gray-500">{translate("dashboard.shortVideo.propertyTypeHint")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {PROPERTY_TYPE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPropertyType(option)}
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.templateLabel")}</label>
            <select
              value={sceneTemplateId}
              onChange={(e) => setSceneTemplateId(e.target.value)}
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.resolutionLabel")}</label>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {translate("common.fixed1080p")}
              </div>
              <p className="mt-1 text-xs text-gray-500">{translate("dashboard.shortVideo.resolutionFixedHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.aspectRatioLabel")}</label>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">16:9</div>
              <p className="mt-1 text-xs text-gray-500">{translate("dashboard.shortVideo.aspectRatioFixedHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.durationLabel")}</label>
              <select
                value={durationEditable ? durationSeconds : fixedDuration || durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
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

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{translate("dashboard.shortVideo.serviceTierLabel")}</label>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setServiceTier("standard")}
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

          {!durationEditable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {translate("dashboard.shortVideo.basicDurationHint")}
              <div className="mt-1">{translate("dashboard.shortVideo.durationLockedHint")}</div>
            </div>
          )}

          {!quota.can_purchase_quota_package && quota.access_tier === "signup_bonus" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {translate("dashboard.shortVideo.signupHint")}
              <Link href="/billing" className="mx-1 font-medium underline">
                {translate("dashboard.shortVideo.signupLink")}
              </Link>
              {translate("dashboard.shortVideo.signupHintTail")}
            </div>
          )}

          {formMessage && <p className="text-sm text-green-600">{formMessage}</p>}
          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={creating || quota.total_available <= 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating
                ? translate("dashboard.shortVideo.creating")
                : quota.total_available > 0
                  ? translate("dashboard.shortVideo.create")
                  : translate("dashboard.shortVideo.noQuota")}
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
