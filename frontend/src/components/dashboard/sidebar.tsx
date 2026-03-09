"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getDashboardNavSections, type DashboardNavItem } from "@/components/dashboard/nav-items";
import { useLocale } from "@/components/providers/locale-provider";

type DashboardSidebarProps = {
  mobile?: boolean;
};

export function DashboardSidebar({ mobile = false }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { translate } = useLocale();
  const dashboardNavSections = getDashboardNavSections(translate);

  return (
    <nav
      className={
        mobile
          ? "overflow-x-auto rounded-xl border bg-white p-3"
          : "sticky top-4 rounded-2xl border bg-white p-4"
      }
    >
      <div className={mobile ? "space-y-3" : "space-y-0"}>
        {dashboardNavSections.map((section) => (
          <div
            key={section.key}
            className={mobile ? "space-y-2" : "space-y-2 border-t border-gray-100 pt-5 first:border-t-0 first:pt-0"}
          >
            <div className="px-2">
              <p className={mobile ? "text-sm font-semibold text-gray-900" : "text-[15px] font-semibold text-gray-900"}>
                {section.label}
              </p>
            </div>
            <NavList items={section.items} pathname={pathname} mobile={mobile} />
          </div>
        ))}
      </div>
    </nav>
  );
}

function NavList({
  items,
  pathname,
  mobile,
}: {
  items: DashboardNavItem[];
  pathname: string;
  mobile: boolean;
}) {
  return (
    <div className={mobile ? "flex flex-wrap gap-2" : "ml-3 border-l border-gray-100 pl-3 space-y-1"}>
      {items.map((item) => {
        const hasChildMatch = items.some(
          (o) => o !== item && o.href.startsWith(item.href + "/") && pathname.startsWith(o.href),
        );
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`) && !hasChildMatch);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              mobile
                ? `whitespace-nowrap rounded-lg border px-3 py-2 text-sm ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`
                : `block rounded-xl px-4 py-3 ${
                    active
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-gray-700 hover:bg-gray-50"
                  }`
            }
          >
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{item.label}</div>
              {item.badge && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{item.badge}</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
