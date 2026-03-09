"use client";

import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { deleteLogo, setDefaultLogo, type UserLogo, uploadVideoAsset } from "@/lib/api";
import { getCachedUserLogos, invalidateUserLogosCache } from "@/lib/video-config-cache";

export default function AccountLogosPage() {
  const { accessToken } = useDashboardSession();
  const { translate } = useLocale();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoName, setLogoName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyLogoId, setBusyLogoId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getCachedUserLogos(accessToken)
      .then(setLogos)
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function reloadLogos() {
    const latestLogos = await getCachedUserLogos(accessToken, { force: true });
    setLogos(latestLogos);
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

      <div className="mt-4 rounded-xl border bg-gray-50 p-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">{translate("dashboard.accountPage.logoNameLabel")}</label>
        <input
          type="text"
          value={logoName}
          onChange={(e) => setLogoName(e.target.value)}
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
    </section>
  );
}
