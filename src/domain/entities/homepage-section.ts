export const HOMEPAGE_SECTION_KEYS = [
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
] as const;

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];

export type HomepageSection = {
  key: HomepageSectionKey;
  imageKey: string | null;
  updatedAt: Date;
};
