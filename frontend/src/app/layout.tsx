import type { Metadata } from "next";
import "./globals.css";

import { LocaleProvider } from "@/components/providers/locale-provider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://listinglive.ca";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ListingLive",
    template: "%s | ListingLive",
  },
  icons: {
    icon: [
      { url: "/brand-mark.svg?v=2", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/brand-mark.svg?v=2", type: "image/svg+xml" }],
    apple: [{ url: "/brand-mark.svg?v=2", type: "image/svg+xml" }],
  },
  description:
    "Turn listing photos into dynamic showcase content with an AI workflow built for real estate teams. Canada's own AI tool for realtors.",
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: siteUrl,
    siteName: "ListingLive",
    title: "ListingLive — Real Estate Listing Videos, Made Simple",
    description:
      "Turn listing photos into dynamic showcase content with an AI workflow built for real estate teams. Canada's own AI tool for realtors.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ListingLive — Real Estate Listing Videos, Made Simple",
    description:
      "Turn listing photos into dynamic showcase content with an AI workflow built for real estate teams. Canada's own AI tool for realtors.",
  },
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
