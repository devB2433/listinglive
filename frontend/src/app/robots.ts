import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://listinglive.ca";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/admin/", "/account/", "/billing/", "/videos/", "/notifications/", "/me"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
