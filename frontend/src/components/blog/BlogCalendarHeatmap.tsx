"use client";

import { useMemo } from "react";

const CELL_SIZE_PX = 12;

type HeatmapDay = {
  dateKey: string;
  hasPost: boolean;
  tooltip: string;
};

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartOffset(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

type BlogCalendarHeatmapProps = {
  dates: string[]; // YYYY-MM-DD
  locale?: string;
  labelHasPost?: string;
  labelNoPost?: string;
};

export function BlogCalendarHeatmap({
  dates,
  locale = "en",
  labelHasPost = "has post",
  labelNoPost = "no post",
}: BlogCalendarHeatmapProps) {
  const postDateSet = useMemo(() => new Set(dates), [dates]);

  const { monthLabel, weekdayLabels, grid } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthLabel = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(monthStart);
    const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, 8 + i)),
    );

    const days: HeatmapDay[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      const dateKey = formatDateKey(cursor);
      const hasPost = postDateSet.has(dateKey);
      const tooltip =
          new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(cursor) + (hasPost ? ` — ${labelHasPost}` : ` — ${labelNoPost}`);
      days.push({ dateKey, hasPost, tooltip });
      cursor.setDate(cursor.getDate() + 1);
    }

    const firstDow = weekStartOffset(monthStart.getDay());
    const padded: HeatmapDay[] = [];
    for (let i = 0; i < firstDow; i += 1) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - (firstDow - i));
      padded.push({
        dateKey: `pad-${i}`,
        hasPost: false,
        tooltip: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d),
      });
    }
    padded.push(...days);
    const lastReal = days[days.length - 1];
    const lastDow = lastReal ? weekStartOffset(parseDateKey(lastReal.dateKey).getDay()) : 0;
    for (let i = 0; i < 6 - lastDow; i += 1) {
      const d = new Date(monthEnd);
      d.setDate(d.getDate() + 1 + i);
      padded.push({
        dateKey: `pad-end-${i}`,
        hasPost: false,
        tooltip: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d),
      });
    }

    const grid: HeatmapDay[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      grid.push(padded.slice(i, i + 7));
    }
    return { monthLabel, weekdayLabels, grid };
  }, [locale, postDateSet, labelHasPost, labelNoPost]);

  return (
    <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="text-sm font-medium text-slate-700">{monthLabel}</p>
      <div className="mt-3 space-y-0.5">
        <div className="flex gap-0.5">
          {weekdayLabels.map((label, i) => (
            <div
              key={i}
              className="flex shrink-0 items-center justify-center text-[10px] text-slate-500"
              style={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }}
            >
              {label}
            </div>
          ))}
        </div>
        {grid.map((row, ri) => (
          <div key={ri} className="flex gap-0.5">
            {row.map((cell) => (
              <div
                key={cell.dateKey}
                title={cell.tooltip}
                className={`shrink-0 rounded-sm ${cell.hasPost ? "bg-green-500" : "bg-slate-200"}`}
                style={{ height: CELL_SIZE_PX, width: CELL_SIZE_PX }}
                aria-label={cell.tooltip}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
