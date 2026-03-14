import type { Metadata } from "next";

import { DashboardLayoutClient } from "./dashboard-layout-client";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
