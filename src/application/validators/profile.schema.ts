import { z } from "zod";

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export const updateClientProfileSchema = z.object({
  phone: z
    .string()
    .max(32, "Phone must be at most 32 characters")
    .transform(emptyToNull),
  companyName: z
    .string()
    .max(200, "Company name must be at most 200 characters")
    .transform(emptyToNull),
});

export type UpdateClientProfileFormInput = z.infer<
  typeof updateClientProfileSchema
>;

export const updateLawyerProfileSchema = z.object({
  headline: z
    .string()
    .max(160, "Headline must be at most 160 characters")
    .transform(emptyToNull),
  bio: z
    .string()
    .max(5000, "Bio must be at most 5000 characters")
    .transform(emptyToNull),
  yearsOfExperience: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    return value;
  }, z.coerce.number().int().min(0).max(70).nullable()),
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .max(64, "Timezone must be at most 64 characters"),
  isListed: z.boolean(),
});

export type UpdateLawyerProfileFormInput = z.infer<
  typeof updateLawyerProfileSchema
>;

export const LAWYER_TIMEZONE_OPTIONS = [
  "Asia/Ulaanbaatar",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Seoul",
  "UTC",
] as const;
