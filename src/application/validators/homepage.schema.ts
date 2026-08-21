import { z } from "zod";

import { HOMEPAGE_SECTION_KEYS } from "@/domain/entities/homepage-section";

export const HOMEPAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const HOMEPAGE_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const setHomepageSectionImageSchema = z.object({
  key: z.enum(HOMEPAGE_SECTION_KEYS),
});

export type SetHomepageSectionImageFormInput = z.infer<
  typeof setHomepageSectionImageSchema
>;

export const clearHomepageSectionImageSchema = z.object({
  key: z.enum(HOMEPAGE_SECTION_KEYS),
});
