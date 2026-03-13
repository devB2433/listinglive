"use client";

import type { ReactNode } from "react";

type InfoTooltipProps = {
  text: string;
  ariaLabel?: string;
};

export function InfoTooltip({ text, ariaLabel = "More info" }: Readonly<InfoTooltipProps>) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        title={text}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-[11px] font-semibold text-gray-500 transition hover:border-gray-400 hover:text-gray-700"
      >
        ?
      </span>
      <span className="pointer-events-none absolute right-0 top-7 z-20 w-64 rounded-xl bg-gray-900 px-3 py-2 text-left text-xs leading-5 text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

type PlanBadgeProps = {
  children: ReactNode;
};

export function PlanBadge({ children }: Readonly<PlanBadgeProps>) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
      {children}
    </span>
  );
}
