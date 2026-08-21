import { z } from "zod";

export const createPracticeAreaSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  nameMn: z.string().trim().min(1, "Mongolian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
});
export type CreatePracticeAreaFormInput = z.infer<
  typeof createPracticeAreaSchema
>;

export const updatePracticeAreaSchema = z.object({
  id: z.string().min(1),
  nameMn: z.string().trim().min(1, "Mongolian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
});
export type UpdatePracticeAreaFormInput = z.infer<
  typeof updatePracticeAreaSchema
>;

export const createLanguageSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Code is required")
    .max(10, "Code is too long"),
  nameMn: z.string().trim().min(1, "Mongolian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
});
export type CreateLanguageFormInput = z.infer<typeof createLanguageSchema>;

export const updateLanguageSchema = z.object({
  id: z.string().min(1),
  nameMn: z.string().trim().min(1, "Mongolian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
});
export type UpdateLanguageFormInput = z.infer<typeof updateLanguageSchema>;

export const toggleTaxonomyActiveSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});
export type ToggleTaxonomyActiveInput = z.infer<
  typeof toggleTaxonomyActiveSchema
>;
