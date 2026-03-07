"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { useDashboardSession } from "@/components/providers/session-provider";
import { getVideoTasks, type VideoTask } from "@/lib/api";
import { getAccessTierLabel, getShortDurationSummary, isAdvancedAccess } from "@/lib/capabilities";

export default function DashboardPage() {
  const { user, quota, accessToken } = useDashboardSession();
  const { locale, translate } = useLocale();
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const capabilitySummary = useMemo(() => {
    if (quota.access_tier === "signup_bonus") return translate("dashboard.quotaSummary.signup");
    if (isAdvancedAccess(quota)) return translate("dashboard.quotaSummary.advanced");
    if (quota.access_tier === "basic") return translate("dashboard.quotaSummary.basic");
    return translate("dashboard.quotaSummary.none");
  }, [quota, translate]);
  const heatmap = useMemo(() => buildTaskHeatmap(tasks, locale), [tasks, locale]);

  useEffect(() => {
    let cancelled = false;

    getVideoTasks(accessToken)
      .then((taskData) => {
        if (!cancelled) {
          setTasks(taskData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTasks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTasksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-500">{translate("dashboard.overview.welcome")}</p>
        <h2 className="mt-2 text-2xl font-semibold text-gray-900">{user.username}</h2>
        <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p className="font-medium">
            {translate("dashboard.header.currentPermission", { value: getAccessTierLabel(translate, quota.access_tier) })}
          </p>
          <p className="mt-1">{capabilitySummary}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/videos/create" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            {translate("dashboard.overview.createShort")}
          </Link>
          <Link href="/videos/tasks" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
            {translate("dashboard.overview.viewTasks")}
          </Link>
          <Link href="/billing" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
            {translate("dashboard.overview.viewQuota")}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={translate("dashboard.overview.totalQuota")}
          value={String(quota.total_available)}
          detail={translate("dashboard.overview.totalQuotaDetail")}
        />
        <SummaryCard
          title={translate("dashboard.overview.currentPlan")}
          value={getAccessTierLabel(translate, quota.access_tier)}
          detail={getShortDurationSummary(translate, quota)}
        />
        <SummaryCard
          title={translate("dashboard.overview.subscriptionRemaining")}
          value={String(quota.subscription_remaining)}
          detail={quota.subscription_plan_type || translate("common.notSubscribed")}
        />
        <SummaryCard
          title={translate("dashboard.overview.paidPackageRemaining")}
          value={String(quota.paid_package_remaining)}
          detail={translate("dashboard.overview.paidPackageDetail")}
        />
        <SummaryCard
          title={translate("dashboard.overview.signupBonusRemaining")}
          value={String(quota.signup_bonus_remaining)}
          detail={translate("dashboard.overview.signupBonusDetail")}
        />
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{translate("dashboard.overview.activityTitle")}</h2>
            <p className="text-sm text-gray-500">{translate("dashboard.overview.activityDescription")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{translate("dashboard.overview.activityLegendLess")}</span>
            {INTENSITY_CLASSNAMES.map((className, index) => (
              <span key={index} className={`h-3 w-3 rounded-sm border border-gray-200 ${className}`} />
            ))}
            <span>{translate("dashboard.overview.activityLegendMore")}</span>
          </div>
        </div>

        {tasksLoading ? (
          <p className="mt-6 text-sm text-gray-500">{translate("dashboard.overview.activityLoading")}</p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-6">
              {heatmap.monthBlocks.map((block, bi) => (
                <div key={bi} className="flex flex-col gap-2">
                  <div className="text-center text-xs font-medium text-gray-600">{block.label}</div>
                  <div className="flex flex-col gap-[2px]">
                    <div
                      className="grid gap-[2px]"
                      style={{ gridTemplateColumns: `repeat(7, ${CELL_SIZE_PX}px)` }}
                    >
                      {heatmap.weekdayLabels.map((label, i) => (
                        <div
                          key={i}
                          className="overflow-hidden text-ellipsis text-center text-[10px] text-gray-400"
                          style={{ width: CELL_SIZE_PX, minWidth: CELL_SIZE_PX }}
                          title={label}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    <div
                      className="grid gap-[2px]"
                      style={{
                        gridTemplateColumns: `repeat(7, ${CELL_SIZE_PX}px)`,
                        gridAutoRows: `${CELL_SIZE_PX}px`,
                      }}
                    >
                      {block.grid.flat().map((day) => (
                        <div
                          key={day.dateKey}
                          title={day.tooltip}
                          className={`rounded-[2px] border border-gray-100 ${INTENSITY_CLASSNAMES[day.level]}`}
                          style={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX, minWidth: CELL_SIZE_PX, minHeight: CELL_SIZE_PX }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title={translate("dashboard.overview.activityTotalTasks")}
                value={String(heatmap.totalTasks)}
                detail={translate("dashboard.overview.activityTotalTasksDetail")}
              />
              <SummaryCard
                title={translate("dashboard.overview.activityMostActiveDay")}
                value={heatmap.mostActiveDayLabel}
                detail={translate("dashboard.overview.activityMostActiveDayDetail", { count: heatmap.mostActiveCount })}
              />
              <SummaryCard
                title={translate("dashboard.overview.activityCurrentStreak")}
                value={translate("dashboard.overview.activityDaysValue", { count: heatmap.currentStreak })}
                detail={translate("dashboard.overview.activityCurrentStreakDetail")}
              />
              <SummaryCard
                title={translate("dashboard.overview.activityLongestStreak")}
                value={translate("dashboard.overview.activityDaysValue", { count: heatmap.longestStreak })}
                detail={translate("dashboard.overview.activityLongestStreakDetail")}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{detail}</p>
    </div>
  );
}

const INTENSITY_CLASSNAMES = [
  "bg-gray-100",
  "bg-green-100",
  "bg-green-300",
  "bg-green-500",
  "bg-green-700",
];

type HeatmapDay = {
  dateKey: string;
  count: number;
  level: number;
  tooltip: string;
};

function weekStartOffset(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

const MONTHS_IN_HEATMAP = 6;
const CELL_SIZE_PX = 12;

type MonthBlock = {
  label: string;
  grid: HeatmapDay[][]; // rows = weeks, cols = 7 (Mon-Sun)
};

function buildTaskHeatmap(tasks: VideoTask[], locale: string) {
  const countsByDay = new Map<string, number>();

  for (const task of tasks) {
    const dateKey = toDateKey(task.created_at);
    if (!dateKey) continue;
    countsByDay.set(dateKey, (countsByDay.get(dateKey) ?? 0) + 1);
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const start = new Date(now.getFullYear(), now.getMonth() - MONTHS_IN_HEATMAP + 1, 1);

  const rangeCounts = new Map<string, number>();
  for (const [k, v] of Array.from(countsByDay)) {
    const d = new Date(`${k}T00:00:00`);
    if (d >= start && d <= end) rangeCounts.set(k, v);
  }
  const maxCount = Math.max(...Array.from(rangeCounts.values()), 0);

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, 8 + i)),
  );

  const monthBlocks: MonthBlock[] = [];
  for (let m = 0; m < MONTHS_IN_HEATMAP; m += 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - MONTHS_IN_HEATMAP + 1 + m, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const label = new Intl.DateTimeFormat(locale, { month: "short" }).format(monthStart);

    const days: HeatmapDay[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      const dateKey = cursor.toISOString().slice(0, 10);
      const count = rangeCounts.get(dateKey) ?? 0;
      days.push({
        dateKey,
        count,
        level: getIntensityLevel(count, maxCount),
        tooltip: buildTooltip(new Date(cursor), count, locale),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const firstDow = weekStartOffset(monthStart.getDay());
    const padded: HeatmapDay[] = [];
    for (let i = 0; i < firstDow; i += 1) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - (firstDow - i));
      padded.push({
        dateKey: `pad-${m}-${i}`,
        count: 0,
        level: 0,
        tooltip: buildTooltip(d, 0, locale),
      });
    }
    padded.push(...days);
    const lastReal = days[days.length - 1];
    const lastDow = lastReal ? weekStartOffset(new Date(lastReal.dateKey).getDay()) : 0;
    for (let i = 0; i < 6 - lastDow; i += 1) {
      const d = new Date(monthEnd);
      d.setDate(d.getDate() + 1 + i);
      padded.push({
        dateKey: `pad-end-${m}-${i}`,
        count: 0,
        level: 0,
        tooltip: buildTooltip(d, 0, locale),
      });
    }

    const grid: HeatmapDay[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      grid.push(padded.slice(i, i + 7));
    }
    monthBlocks.push({ label, grid });
  }

  const allDays = monthBlocks
    .flatMap((b) => b.grid.flat())
    .filter((d) => !d.dateKey.startsWith("pad-"))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const activeDayEntries = Array.from(rangeCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const mostActiveDateKey = activeDayEntries[0]?.[0] ?? null;
  const mostActiveCount = activeDayEntries[0]?.[1] ?? 0;
  const mostActiveDayLabel = mostActiveDateKey
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${mostActiveDateKey}T00:00:00`))
    : "-";

  const rangeTasksTotal = Array.from(rangeCounts.values()).reduce((a, b) => a + b, 0);

  return {
    monthBlocks,
    weekdayLabels,
    totalTasks: rangeTasksTotal,
    mostActiveCount,
    mostActiveDayLabel,
    currentStreak: getCurrentStreakInRange(rangeCounts, start, now),
    longestStreak: getLongestStreak(allDays),
  };
}

function getIntensityLevel(count: number, maxCount: number) {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((count / maxCount) * 4)));
}

function buildTooltip(date: Date, count: number, locale: string) {
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  return `${dateLabel}: ${count}`;
}

function toDateKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString().slice(0, 10);
}

function getCurrentStreakInRange(countsByDay: Map<string, number>, rangeStart: Date, rangeEnd: Date) {
  let streak = 0;
  const cursor = new Date(rangeEnd);
  cursor.setHours(0, 0, 0, 0);
  const startKey = rangeStart.toISOString().slice(0, 10);

  while (true) {
    const dateKey = cursor.toISOString().slice(0, 10);
    if (dateKey < startKey) break;
    if ((countsByDay.get(dateKey) ?? 0) <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getLongestStreak(days: HeatmapDay[]) {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

