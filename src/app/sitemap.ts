import type { MetadataRoute } from "next";

import { lawyerProfileRepository } from "@/infrastructure/repositories";
import { env } from "@/lib/env";

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
      url: `${base}/lawyers`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...lawyers.map((profile) => ({
      url: `${base}/lawyers/${profile.slug}`,
      lastModified: profile.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
