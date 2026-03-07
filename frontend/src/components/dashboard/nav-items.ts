export type DashboardNavItem = {
  href: string;
  label: string;
  description: string;
  badge?: string;
};

export type DashboardNavSection = {
  key: string;
  label: string;
  description: string;
  items: DashboardNavItem[];
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function getDashboardNavSections(translate: Translate): DashboardNavSection[] {
  return [
    {
      key: "overview",
      label: translate("dashboard.nav.overview"),
      description: translate("dashboard.nav.overviewDesc"),
      items: [
        {
          href: "/dashboard",
          label: translate("dashboard.nav.dashboard"),
          description: translate("dashboard.nav.dashboardDesc"),
        },
      ],
    },
    {
      key: "creation",
      label: translate("dashboard.nav.creation"),
      description: translate("dashboard.nav.creationDesc"),
      items: [
        {
          href: "/videos/create",
          label: translate("dashboard.nav.shortVideo"),
          description: translate("dashboard.nav.shortVideoDesc"),
        },
        {
          href: "/videos/tasks",
          label: translate("dashboard.nav.tasks"),
          description: translate("dashboard.nav.tasksDesc"),
        },
        {
          href: "/videos/merge",
          label: translate("dashboard.nav.longVideo"),
          description: translate("dashboard.nav.longVideoDesc"),
        },
      ],
    },
    {
      key: "account",
      label: translate("dashboard.nav.account"),
      description: translate("dashboard.nav.accountDesc"),
      items: [
        {
          href: "/account",
          label: translate("dashboard.nav.accountInfo"),
          description: translate("dashboard.nav.accountInfoDesc"),
        },
        {
          href: "/account/language",
          label: translate("dashboard.nav.language"),
          description: translate("dashboard.nav.languageDesc"),
        },
        {
          href: "/billing",
          label: translate("dashboard.nav.billing"),
          description: translate("dashboard.nav.billingDesc"),
        },
        {
          href: "/notifications",
          label: translate("dashboard.nav.notifications"),
          description: translate("dashboard.nav.notificationsDesc"),
        },
      ],
    },
  ];
}

export function getPageTitle(translate: Translate, pathname: string) {
  if (pathname.startsWith("/videos/create")) return translate("dashboard.titles.videosCreate");
  if (pathname.startsWith("/videos/tasks")) return translate("dashboard.titles.videosTasks");
  if (pathname.startsWith("/videos/merge")) return translate("dashboard.titles.videosMerge");
  if (pathname.startsWith("/billing")) return translate("dashboard.titles.billing");
  if (pathname.startsWith("/account/language")) return translate("dashboard.titles.language");
  if (pathname.startsWith("/account")) return translate("dashboard.titles.account");
  if (pathname.startsWith("/notifications")) return translate("dashboard.titles.notifications");
  return translate("dashboard.titles.dashboard");
}
