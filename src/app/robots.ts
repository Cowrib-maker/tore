import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/lawyers", "/lawyers/"],
        disallow: [
          "/api/",
          "/client/",
          "/lawyer/",
          "/admin/",
          "/login",
          "/register/",
          "/forgot-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
