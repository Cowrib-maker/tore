import { z } from "zod";

import { CredentialReviewStatus } from "@/domain/enums";

export const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024;
export const CREDENTIAL_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const submitLawyerCredentialSchema = z.object({
  licenseNumber: z
    .string()
    .trim()
    .min(3, "License number must be at least 3 characters")
    .max(64, "License number is too long"),
  issuingAuthority: z
    .string()
    .trim()
    .min(2, "Issuing authority is required")
    .max(200, "Issuing authority is too long"),
});

export type SubmitLawyerCredentialFormInput = z.infer<
  typeof submitLawyerCredentialSchema
>;

export const reviewLawyerCredentialSchema = z
  .object({
    credentialId: z.string().min(1),
    decision: z.enum([
      CredentialReviewStatus.APPROVED,
      CredentialReviewStatus.REJECTED,
    ]),
    rejectionReason: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.decision === CredentialReviewStatus.REJECTED &&
      (!value.rejectionReason || value.rejectionReason.length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rejection reason must be at least 5 characters",
        path: ["rejectionReason"],
      });
    }
  });

export type ReviewLawyerCredentialFormInput = z.infer<
  typeof reviewLawyerCredentialSchema
>;

export const setLawyerDirectoryListingSchema = z.object({
  lawyerProfileId: z.string().min(1),
  isListed: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type SetLawyerDirectoryListingFormInput = z.infer<
  typeof setLawyerDirectoryListingSchema
>;
