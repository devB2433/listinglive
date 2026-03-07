"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/locale-provider";

export default function HomePage() {
  const { locale, setLocale, translate } = useLocale();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-6 px-4">
      <div className="flex items-center gap-2 self-end">
        {(["zh-CN", "en"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLocale(value)}
            className={`rounded-full px-3 py-1 text-sm ${
              locale === value ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"
            }`}
          >
            {value === "zh-CN" ? translate("common.chinese") : translate("common.english")}
          </button>
        ))}
      </div>
      <h1 className="text-3xl font-bold">{translate("common.brand")}</h1>
      <p className="text-gray-600">{translate("home.tagline")}</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {translate("home.login")}
        </Link>
        <Link
          href="/register"
          className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
        >
          {translate("home.register")}
        </Link>
      </div>
    </div>
  );
}
