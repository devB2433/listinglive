"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminSessionProvider, useAdminSession } from "@/components/providers/admin-session-provider";
import { useLocale } from "@/components/providers/locale-provider";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", titleKey: "admin.nav.dashboard" },
  { href: "/admin/users", titleKey: "admin.nav.users" },
  { href: "/admin/tasks", titleKey: "admin.nav.tasks" },
  { href: "/admin/invite-codes", titleKey: "admin.nav.inviteCodes" },
];

export function AdminLayoutClient({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}

function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { logout, user } = useAdminSession();
  const { translate } = useLocale();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 md:px-6">
        <aside className="hidden w-72 shrink-0 rounded-2xl border bg-white p-4 md:block">
          <p className="text-sm font-semibold text-gray-900">{translate("admin.shell.title")}</p>
          <p className="mt-1 text-xs text-gray-500">{translate("admin.shell.subtitle")}</p>
          <nav className="mt-6 space-y-2">
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 text-sm ${active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {translate(item.titleKey)}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 space-y-4">
          <header className="rounded-2xl border bg-white px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-gray-500">{translate("admin.shell.badge")}</p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900">{translate(getAdminPageTitle(pathname))}</h1>
                <p className="mt-1 text-sm text-gray-500">
                  {translate("admin.shell.signedInAs", { value: user.username })}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/dashboard" className="rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50">
                  {translate("admin.shell.backToDashboard")}
                </Link>
                <button type="button" onClick={logout} className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                  {translate("common.logout")}
                </button>
              </div>
            </div>
          </header>
          <div className="rounded-2xl border bg-white p-4 md:hidden">
            <div className="flex flex-wrap gap-2">
              {ADMIN_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm ${pathname === item.href ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-700"}`}
                >
                  {translate(item.titleKey)}
                </Link>
              ))}
            </div>
          </div>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}

function getAdminPageTitle(pathname: string) {
  if (pathname.startsWith("/admin/users")) return "admin.titles.users";
  if (pathname.startsWith("/admin/tasks")) return "admin.titles.tasks";
  if (pathname.startsWith("/admin/invite-codes")) return "admin.titles.inviteCodes";
  return "admin.titles.dashboard";
}
