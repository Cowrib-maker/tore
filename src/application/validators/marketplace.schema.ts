import { z } from "zod";

import { ConsultationModality, DayOfWeek } from "@/domain/enums";

export const upsertOfferingSchema = z.object({
  titleMn: z.string().trim().min(2).max(120),
  titleEn: z.string().trim().max(120).optional().or(z.literal("")),
  descriptionMn: z.string().trim().max(2000).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  priceMnt: z.coerce.number().int().min(1000).max(50_000_000),
  modality: z.nativeEnum(ConsultationModality),
  isActive: z.boolean().optional(),
});

export type UpsertOfferingInput = z.infer<typeof upsertOfferingSchema>;

export const createAvailabilityRuleSchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export type CreateAvailabilityRuleFormInput = z.infer<
  typeof createAvailabilityRuleSchema
>;

export const createAvailabilityExceptionSchema = z.object({
  exceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  isAvailable: z.boolean().default(false),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const createBookingRequestSchema = z.object({
  lawyerSlug: z.string().min(1),
  offeringId: z.string().min(1),
  scheduledStartAt: z.string().datetime(),
  issueSummary: z.string().trim().min(20).max(5000),
  practiceAreaId: z.string().optional().or(z.literal("")),
});

export type CreateBookingRequestInput = z.infer<
  typeof createBookingRequestSchema
>;

export const respondBookingSchema = z.object({
  bookingId: z.string().min(1),
  decision: z.enum(["ACCEPT", "REJECT"]),
  declineReason: z.string().trim().max(2000).optional(),
});

export const setLawyerTaxonomySchema = z.object({
  practiceAreaIds: z.array(z.string()).max(20),
  languageIds: z.array(z.string()).max(20),
});

export const updateLawyerProfileMarketplaceSchema = z.object({
  headline: z.string().trim().max(200).optional().or(z.literal("")),
  bio: z.string().trim().max(5000).optional().or(z.literal("")),
  yearsOfExperience: z.coerce.number().int().min(0).max(60).optional().nullable(),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  education: z.string().trim().max(2000).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64).default("Asia/Ulaanbaatar"),
  isListed: z.boolean().optional(),
});
