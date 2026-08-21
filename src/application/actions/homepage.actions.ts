import type { HomepageSectionKey } from "@/domain/entities/homepage-section";
import { homepageSectionRepository } from "@/infrastructure/repositories";
import { buildPublicHomepageImagePath } from "@/infrastructure/storage/file-access";

export async function getHomepageSectionImages(): Promise<
  Record<HomepageSectionKey, string | null>
> {
  const sections = await homepageSectionRepository.findAll();
  const map = Object.fromEntries(
    sections.map((section) => [
      section.key,
      section.imageKey ? buildPublicHomepageImagePath(section.imageKey) : null,
    ]),
  ) as Record<HomepageSectionKey, string | null>;

  for (const key of [
    "hero",
    "experiences",
    "legal-ai",
    "knowledge",
    "workspace",
    "marketplace",
    "enterprise",
    "trust",
    "how",
    "faq",
  ] as HomepageSectionKey[]) {
    if (!(key in map)) map[key] = null;
  }

  return map;
}
