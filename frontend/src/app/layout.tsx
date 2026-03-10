import type { Metadata } from "next";
import "./globals.css";

import { LocaleProvider } from "@/components/providers/locale-provider";

export const metadata: Metadata = {
  title: "ListingLive",
  description: "Turn listing photos into dynamic showcase content with an AI workflow built for real estate teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
