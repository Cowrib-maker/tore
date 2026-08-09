"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { ActionState } from "@/application/actions/auth.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import type { ActorContext } from "@/application/common/actor-context";
import {
  createAvailabilityExceptionUseCase,
  createAvailabilityRuleUseCase,
  deleteAvailabilityExceptionUseCase,
  deleteAvailabilityRuleUseCase,
} from "@/application/use-cases/catalog/manage-availability";
import {
  createOfferingUseCase,
  deleteOfferingUseCase,
  updateOfferingUseCase,
} from "@/application/use-cases/catalog/manage-offerings";
import {
  createBookingRequestUseCase,
  respondToBookingRequestUseCase,
} from "@/application/use-cases/bookings/booking-requests";
import {
  createAvailabilityExceptionSchema,
  createAvailabilityRuleSchema,
  createBookingRequestSchema,
  respondBookingSchema,
  setLawyerTaxonomySchema,
  upsertOfferingSchema,
} from "@/application/validators/marketplace.schema";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { ConsultationModality, UserRole } from "@/domain/enums";
import { mapActionError } from "@/application/common/map-action-error";
import {
  auditLogRepository,
  availabilityRepository,
  bookingRepository,
  consultationOfferingRepository,
  languageRepository,
  lawyerProfileRepository,
  lawyerTaxonomyRepository,
  notificationRepository,
  platformSettingRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";
import {
  AVAILABILITY_WRITE_RATE_LIMIT,
  BOOKING_CREATE_RATE_LIMIT,
  BOOKING_RESPOND_RATE_LIMIT,
  OFFERING_WRITE_RATE_LIMIT,
  PROFILE_WRITE_RATE_LIMIT,
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";

function mapError(error: unknown): ActionState {
  return mapActionError(error);
}

function tooManyWrites(retryAfterSeconds: number): ActionState {
  return {
    error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
  };
}

async function getClientIp(): Promise<string | undefined> {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined
  );
}

async function requireRole(role: UserRole): Promise<ActorContext> {
  const session = await getSessionUser();
  if (!session?.user?.id) throw new UnauthorizedError();
  if (session.user.role !== role) throw new ForbiddenError();
  return { userId: session.user.id, role };
}

const offeringDeps = {
  lawyerProfileRepository,
  consultationOfferingRepository,
  auditLogRepository,
};

const availabilityDeps = {
  lawyerProfileRepository,
  availabilityRepository,
  auditLogRepository,
};

const bookingDeps = {
  lawyerProfileRepository,
  consultationOfferingRepository,
  availabilityRepository,
  bookingRepository,
  notificationRepository,
  auditLogRepository,
  platformSettingRepository,
};

export async function createOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT.limit,
      OFFERING_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = upsertOfferingSchema.safeParse({
      titleMn: formData.get("titleMn") ?? "",
      titleEn: formData.get("titleEn") ?? "",
      descriptionMn: formData.get("descriptionMn") ?? "",
      durationMinutes: formData.get("durationMinutes") ?? "",
      priceMnt: formData.get("priceMnt") ?? "",
      modality: formData.get("modality") ?? ConsultationModality.ONLINE,
      isActive: formData.get("isActive") !== "off",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    await createOfferingUseCase(actor, parsed.data, offeringDeps, await getClientIp());
    revalidatePath("/lawyer/offerings");
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT.limit,
      OFFERING_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const offeringId = String(formData.get("offeringId") ?? "");
    const parsed = upsertOfferingSchema.safeParse({
      titleMn: formData.get("titleMn") ?? "",
      titleEn: formData.get("titleEn") ?? "",
      descriptionMn: formData.get("descriptionMn") ?? "",
      durationMinutes: formData.get("durationMinutes") ?? "",
      priceMnt: formData.get("priceMnt") ?? "",
      modality: formData.get("modality") ?? ConsultationModality.ONLINE,
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    await updateOfferingUseCase(
      actor,
      offeringId,
      parsed.data,
      offeringDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/offerings");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT.limit,
      OFFERING_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const offeringId = String(formData.get("offeringId") ?? "");
    await deleteOfferingUseCase(
      actor,
      offeringId,
      offeringDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/offerings");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createAvailabilityRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT.limit,
      AVAILABILITY_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = createAvailabilityRuleSchema.safeParse({
      dayOfWeek: formData.get("dayOfWeek") ?? "",
      startTime: formData.get("startTime") ?? "",
      endTime: formData.get("endTime") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    await createAvailabilityRuleUseCase(
      actor,
      parsed.data,
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/availability");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteAvailabilityRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT.limit,
      AVAILABILITY_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    await deleteAvailabilityRuleUseCase(
      actor,
      String(formData.get("ruleId") ?? ""),
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/availability");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createAvailabilityExceptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT.limit,
      AVAILABILITY_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = createAvailabilityExceptionSchema.safeParse({
      exceptionDate: formData.get("exceptionDate") ?? "",
      startTime: formData.get("startTime") ?? "",
      endTime: formData.get("endTime") ?? "",
      isAvailable: formData.get("isAvailable") === "on",
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    await createAvailabilityExceptionUseCase(
      actor,
      {
        exceptionDate: parsed.data.exceptionDate,
        startTime: parsed.data.startTime || undefined,
        endTime: parsed.data.endTime || undefined,
        isAvailable: parsed.data.isAvailable,
        reason: parsed.data.reason || undefined,
      },
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/availability");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteAvailabilityExceptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT.limit,
      AVAILABILITY_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    await deleteAvailabilityExceptionUseCase(
      actor,
      String(formData.get("exceptionId") ?? ""),
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/availability");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function setLawyerTaxonomyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `taxonomy:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT.limit,
      PROFILE_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const practiceAreaIds = formData.getAll("practiceAreaIds").map(String);
    const languageIds = formData.getAll("languageIds").map(String);
    const parsed = setLawyerTaxonomySchema.safeParse({
      practiceAreaIds,
      languageIds,
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const profile = await lawyerProfileRepository.findByUserId(actor.userId);
    if (!profile) throw new ForbiddenError();
    await lawyerTaxonomyRepository.setPracticeAreas({
      lawyerProfileId: profile.id,
      practiceAreaIds: parsed.data.practiceAreaIds,
    });
    await lawyerTaxonomyRepository.setLanguages({
      lawyerProfileId: profile.id,
      languages: parsed.data.languageIds.map((languageId) => ({ languageId })),
    });
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createBookingRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.CLIENT);
    const rate = await consumeRateLimit(
      `booking:create:${actor.userId}`,
      BOOKING_CREATE_RATE_LIMIT.limit,
      BOOKING_CREATE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return {
        error: `Too many booking requests. Try again in ${rate.retryAfterSeconds} seconds.`,
      };
    }
    const parsed = createBookingRequestSchema.safeParse({
      lawyerSlug: formData.get("lawyerSlug") ?? "",
      offeringId: formData.get("offeringId") ?? "",
      scheduledStartAt: formData.get("scheduledStartAt") ?? "",
      issueSummary: formData.get("issueSummary") ?? "",
      practiceAreaId: formData.get("practiceAreaId") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const booking = await createBookingRequestUseCase(
      actor,
      parsed.data,
      bookingDeps,
      await getClientIp(),
    );
    revalidatePath("/client/bookings");
    revalidatePath("/lawyer/bookings");
    revalidatePath(`/lawyers/${parsed.data.lawyerSlug}`);
    return { success: true, message: booking.bookingNumber };
  } catch (error) {
    return mapError(error);
  }
}

export async function respondBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireRole(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `booking:respond:${actor.userId}`,
      BOOKING_RESPOND_RATE_LIMIT.limit,
      BOOKING_RESPOND_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return {
        error: `Too many responses. Try again in ${rate.retryAfterSeconds} seconds.`,
      };
    }
    const parsed = respondBookingSchema.safeParse({
      bookingId: formData.get("bookingId") ?? "",
      decision: formData.get("decision") ?? "",
      declineReason: formData.get("declineReason") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    await respondToBookingRequestUseCase(
      actor,
      parsed.data,
      bookingDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/bookings");
    revalidatePath("/client/bookings");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function getMarketplaceFilterOptions() {
  const [practiceAreas, languages] = await Promise.all([
    practiceAreaRepository.findAllActive(),
    languageRepository.findAllActive(),
  ]);
  return { practiceAreas, languages };
}
