"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { useAdminSession } from "@/components/providers/admin-session-provider";
import { useLocale } from "@/components/providers/locale-provider";
import {
  disableAdminMfa,
  enableAdminMfa,
  getAdminDashboardDailyStats,
  getAdminDashboardSummary,
  getAdminMfaStatus,
  setupAdminMfa,
  type AdminDashboardDailyStats,
  type AdminDashboardSummary,
  type AdminMfaSetup,
  type AdminMfaStatus,
} from "@/lib/api";

export default function AdminDashboardPage() {
  const { accessToken } = useAdminSession();
  const { translate } = useLocale();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [dailyStats, setDailyStats] = useState<AdminDashboardDailyStats | null>(null);
  const [mfaStatus, setMfaStatus] = useState<AdminMfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<AdminMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [mfaMessage, setMfaMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setError("");
      try {
        const [summaryData, dailyData, mfaStatusData] = await Promise.all([
          getAdminDashboardSummary(accessToken),
          getAdminDashboardDailyStats(accessToken, { days: 30 }),
          getAdminMfaStatus(accessToken),
        ]);
        if (!cancelled) {
          setSummary(summaryData);
          setDailyStats(dailyData);
          setMfaStatus(mfaStatusData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : translate("common.requestFailed"));
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, translate]);

  async function handleSetupMfa() {
    setError("");
    setMfaMessage("");
    try {
      const [setup, status] = await Promise.all([setupAdminMfa(accessToken), getAdminMfaStatus(accessToken)]);
      setMfaSetup(setup);
      setMfaStatus(status);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : translate("common.requestFailed"));
    }
  }

  async function handleEnableMfa() {
    setError("");
    setMfaMessage("");
    try {
      const status = await enableAdminMfa(accessToken, mfaCode);
      setMfaStatus(status);
      setMfaMessage(translate("admin.mfa.enabledSuccess"));
      setMfaSetup(null);
      setMfaCode("");
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : translate("common.requestFailed"));
    }
  }

  async function handleDisableMfa() {
    setError("");
    setMfaMessage("");
    try {
      const status = await disableAdminMfa(accessToken, mfaCode);
      setMfaStatus(status);
      setMfaMessage(translate("admin.mfa.disabledSuccess"));
      setMfaSetup(null);
      setMfaCode("");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : translate("common.requestFailed"));
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <section className="space-y-6">
        <MetricGroup title={translate("admin.dashboard.userSectionTitle")}>
          <SummaryCard title={translate("admin.dashboard.newUsersToday")} value={String(summary?.new_users_today ?? 0)} />
          <SummaryCard title={translate("admin.dashboard.totalUsers")} value={String(summary?.total_users ?? 0)} />
          <div className="md:col-span-2 xl:col-span-4 rounded-xl border bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
              {translate("admin.dashboard.trendNewUsers")}
            </div>
            <TrendLineChart
              labels={(dailyStats?.new_users ?? []).map((point) => point.date.slice(5))}
              series={[
                {
                  label: translate("admin.dashboard.trendNewUsers"),
                  color: "#3b82f6",
                  values: (dailyStats?.new_users ?? []).map((point) => point.value),
                },
              ]}
            />
          </div>
        </MetricGroup>

        <MetricGroup title={translate("admin.dashboard.taskSectionTitle")}>
          <SummaryCard title={translate("admin.dashboard.tasksToday")} value={String(summary?.tasks_today ?? 0)} />
          <SummaryCard title={translate("admin.dashboard.succeededToday")} value={String(summary?.succeeded_today ?? 0)} />
          <SummaryCard title={translate("admin.dashboard.failedToday")} value={String(summary?.failed_today ?? 0)} />
          <SummaryCard title={translate("admin.dashboard.processingNow")} value={String(summary?.processing_now ?? 0)} />
          <div className="md:col-span-2 xl:col-span-4 rounded-xl border bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {translate("admin.dashboard.trendTasks")}
            </div>
            <TrendLineChart
              labels={(dailyStats?.tasks_created ?? []).map((point) => point.date.slice(5))}
              series={[
                {
                  label: translate("admin.dashboard.trendTasks"),
                  color: "#10b981",
                  values: (dailyStats?.tasks_created ?? []).map((point) => point.value),
                },
              ]}
            />
          </div>
        </MetricGroup>

        <MetricGroup title={translate("admin.dashboard.subscriptionSectionTitle")}>
          <SummaryCard title={translate("admin.dashboard.activeSubscriptions")} value={String(summary?.active_subscriptions ?? 0)} />
        </MetricGroup>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("admin.mfa.title")}</h2>
            <p className="mt-1 text-sm text-gray-600">{translate("admin.mfa.subtitle")}</p>
            <p className="mt-2 text-sm text-gray-700">
              {mfaStatus?.enabled ? translate("admin.mfa.statusEnabled") : translate("admin.mfa.statusDisabled")}
            </p>
            {mfaMessage && <p className="mt-2 text-sm text-green-600">{mfaMessage}</p>}
          </div>
          <div className="flex gap-2">
            {!mfaStatus?.enabled && (
              <button
                type="button"
                onClick={() => void handleSetupMfa()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                {translate("admin.mfa.setup")}
              </button>
            )}
          </div>
        </div>

        {mfaSetup && !mfaStatus?.enabled && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-900">{translate("admin.mfa.scanHint")}</p>
            <div className="mt-3 inline-block rounded-lg bg-white p-3">
              <Image
                src={toSvgDataUri(mfaSetup.qr_svg)}
                alt="Admin MFA QR code"
                className="h-56 w-56"
                width={224}
                height={224}
                unoptimized
              />
            </div>
            <p className="mt-3 break-all font-mono text-sm text-gray-800">{mfaSetup.secret}</p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder={translate("admin.mfa.codePlaceholder")}
                className="rounded-md border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => void handleEnableMfa()}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                {translate("admin.mfa.enable")}
              </button>
            </div>
          </div>
        )}

        {mfaStatus?.enabled && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-700">{translate("admin.mfa.disableHint")}</p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder={translate("admin.mfa.codePlaceholder")}
                className="rounded-md border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => void handleDisableMfa()}
                className="rounded-md border border-red-300 bg-white px-4 py-2 text-red-600 hover:bg-red-50"
              >
                {translate("admin.mfa.disable")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </div>
  );
}

function toSvgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function TrendLineChart({
  labels,
  series,
}: {
  labels: string[];
  series: Array<{ label: string; color: string; values: number[] }>;
}) {
  const width = 900;
  const height = 260;
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2 - 24;
  const allValues = series.flatMap((item) => item.values);
  const maxValue = Math.max(...allValues, 1);
  const yTicks = 4;

  function xPosition(index: number) {
    if (labels.length <= 1) return padding;
    return padding + (chartWidth * index) / (labels.length - 1);
  }

  function yPosition(value: number) {
    return padding + chartHeight - (value / maxValue) * chartHeight;
  }

  function buildPath(values: number[]) {
    return values
      .map((value, index) => `${index === 0 ? "M" : "L"} ${xPosition(index)} ${yPosition(value)}`)
      .join(" ");
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        {Array.from({ length: yTicks + 1 }, (_, index) => {
          const value = (maxValue / yTicks) * index;
          const y = padding + chartHeight - (chartHeight / yTicks) * index;
          return (
            <g key={index}>
              <line x1={padding} y1={y} x2={padding + chartWidth} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={0} y={y + 4} fontSize="11" fill="#6b7280">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {labels.map((label, index) => (
          <text
            key={label + index}
            x={xPosition(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
            fontSize="11"
            fill="#6b7280"
          >
            {label}
          </text>
        ))}

        {series.map((item) => (
          <g key={item.label}>
            <path d={buildPath(item.values)} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {item.values.map((value, index) => (
              <circle key={`${item.label}-${index}`} cx={xPosition(index)} cy={yPosition(value)} r="3.5" fill={item.color}>
                <title>{`${item.label}: ${value}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
