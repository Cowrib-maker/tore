import type { MetadataRoute } from "next";

import { lawyerProfileRepository } from "@/infrastructure/repositories";
import { env } from "@/lib/env";

// Sitemap reads live database data, so it must never execute during `next build`.
// Keep it request-time only to avoid blocking Vercel's page-data collection when
// the production database is unavailable or not reachable from the build worker.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  const lawyers = await lawyerProfileRepository.findListed({ limit: 500 });

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/student`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/lawyers`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...lawyers.map((profile) => ({
      url: `${base}/lawyers/${profile.slug}`,
      lastModified: profile.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
