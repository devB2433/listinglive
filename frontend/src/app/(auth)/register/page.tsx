"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { translateApiError } from "@/lib/locale";
import { register, sendCode } from "@/lib/api";
import { setStoredTokens } from "@/lib/session";

type RegisterFieldErrors = {
  username?: string;
  password?: string;
  email?: string;
  code?: string;
  inviteCode?: string;
  general?: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const { locale, translate } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [message, setMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [isFreeTrialFlow, setIsFreeTrialFlow] = useState(false);
  const hasInlineFieldErrors = Boolean(
    fieldErrors.username || fieldErrors.password || fieldErrors.email || fieldErrors.code || fieldErrors.inviteCode,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setIsFreeTrialFlow(params.get("source") === "home-free-trial");
  }, []);

  function getTranslatedApiError(code: string) {
    return translateApiError(code, locale) ?? translate("common.requestFailed");
  }

  function matchesApiError(message: string, code: string) {
    return message === code || message === getTranslatedApiError(code);
  }

  function buildRegisterFieldErrors(message: string): RegisterFieldErrors {
    if (matchesApiError(message, "auth.register.usernameExists")) {
      return {
        username: translate("auth.register.usernameExistsHint"),
      };
    }
    if (matchesApiError(message, "auth.register.emailExists")) {
      return {
        email: translate("auth.register.emailExistsHint"),
      };
    }
    if (matchesApiError(message, "auth.register.invalidCode")) {
      return {
        code: getTranslatedApiError("auth.register.invalidCode"),
      };
    }
    if (matchesApiError(message, "auth.register.inviteCodeRequired")) {
      return {
        inviteCode: getTranslatedApiError("auth.register.inviteCodeRequired"),
      };
    }
    if (
      matchesApiError(message, "auth.register.inviteCodeInvalid") ||
      matchesApiError(message, "auth.register.inviteCodeDisabled")
    ) {
      return {
        inviteCode: message,
      };
    }
    if (
      matchesApiError(message, "auth.password.tooShort") ||
      matchesApiError(message, "auth.password.missingUppercase") ||
      matchesApiError(message, "auth.password.missingLowercase") ||
      matchesApiError(message, "auth.password.missingSpecial")
    ) {
      return {
        password: message,
      };
    }
    return { general: message };
  }

  function getInputClassName(hasError: boolean) {
    return `w-full rounded-md border px-3 py-2 transition ${
      hasError ? "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:outline-none" : "border-gray-300"
    }`;
  }

  async function handleSendCode() {
    setError("");
    setFieldErrors({});
    setMessage("");
    if (!email) {
      setError(translate("auth.register.emailRequired"));
      return;
    }
    setSendingCode(true);
    try {
      const result = await sendCode(email);
      setMessage(
        result.debug_code
          ? translate("auth.register.codeSentDebug", { code: result.debug_code })
          : translate("auth.register.codeSent"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("auth.register.sendCodeFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setMessage("");
    setRegistering(true);
    try {
      const data = await register(username, password, email, code, inviteCode);
      setStoredTokens(data);
      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("auth.register.registerFailed");
      setError(message);
      setFieldErrors(buildRegisterFieldErrors(message));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">
            {isFreeTrialFlow ? translate("auth.register.trialTitle") : translate("auth.register.title")}
          </h1>
        </div>
        <form onSubmit={handleRegister} className="space-y-4 rounded-2xl border bg-white p-6">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-left">
            <p className="text-sm text-emerald-800">{translate("auth.register.inviteBenefits")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setFieldErrors((current) => ({ ...current, username: undefined, general: undefined }));
              }}
              className={getInputClassName(Boolean(fieldErrors.username))}
              aria-invalid={Boolean(fieldErrors.username)}
              required
            />
            {fieldErrors.username && <p className="mt-1 text-sm text-red-600">{fieldErrors.username}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined, general: undefined }));
              }}
              className={getInputClassName(Boolean(fieldErrors.password))}
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.email")}</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined, general: undefined }));
                }}
                className={`flex-1 ${getInputClassName(Boolean(fieldErrors.email))}`}
                aria-invalid={Boolean(fieldErrors.email)}
                required
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode}
                className="shrink-0 rounded-md bg-gray-600 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {sendingCode ? translate("auth.register.sendingCode") : translate("auth.register.sendCode")}
              </button>
            </div>
            {fieldErrors.email && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p>{fieldErrors.email}</p>
                <div className="mt-1 flex gap-3">
                  <Link href="/login" className="text-blue-600 hover:underline">
                    {translate("auth.register.login")}
                  </Link>
                  <Link href="/reset-password" className="text-blue-600 hover:underline">
                    {translate("auth.login.forgotPassword")}
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{translate("auth.register.code")}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setFieldErrors((current) => ({ ...current, code: undefined, general: undefined }));
              }}
              className={getInputClassName(Boolean(fieldErrors.code))}
              aria-invalid={Boolean(fieldErrors.code)}
              placeholder={translate("auth.register.codePlaceholder")}
              required
            />
            {fieldErrors.code && <p className="mt-1 text-sm text-red-600">{fieldErrors.code}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {translate("auth.register.helper")}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {translate("auth.register.inviteCodeLabel")}
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase());
                setFieldErrors((current) => ({ ...current, inviteCode: undefined, general: undefined }));
              }}
              className={getInputClassName(Boolean(fieldErrors.inviteCode))}
              aria-invalid={Boolean(fieldErrors.inviteCode)}
              placeholder={translate("auth.register.inviteCodeHint")}
              required
            />
            {fieldErrors.inviteCode && <p className="mt-1 text-sm text-red-600">{fieldErrors.inviteCode}</p>}
          </div>
          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && !fieldErrors.general && !hasInlineFieldErrors && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={registering}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {registering
              ? translate("auth.register.submitting")
              : isFreeTrialFlow
              ? translate("auth.register.trialSubmit")
              : translate("auth.register.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          {translate("auth.register.hasAccount")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            {translate("auth.register.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
