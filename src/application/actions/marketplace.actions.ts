"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
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
import { ForbiddenError } from "@/domain/errors/domain-error";
import { ConsultationModality, UserRole } from "@/domain/enums";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  auditLogRepository,
  availabilityRepository,
  bookingRepository,
  consultationOfferingRepository,
  invoiceRepository,
  languageRepository,
  lawyerProfileRepository,
  lawyerTaxonomyRepository,
  notificationRepository,
  platformSettingRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";
import {
  createQpayGateway,
  isQpayConfigured,
  qpayCallbackUrl,
} from "@/infrastructure/billing/create-qpay-gateway";
import {
  AVAILABILITY_WRITE_RATE_LIMIT,
  BOOKING_CREATE_RATE_LIMIT,
  BOOKING_RESPOND_RATE_LIMIT,
  OFFERING_WRITE_RATE_LIMIT,
  PROFILE_WRITE_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";

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
  unitOfWork,
  consultationCheckout: isQpayConfigured()
    ? {
        invoiceRepository,
        qpayGateway: createQpayGateway(),
        qpayCallbackUrl: qpayCallbackUrl(),
      }
    : undefined,
};

export async function createOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(upsertOfferingSchema, {
      titleMn: formData.get("titleMn") ?? "",
      titleEn: formData.get("titleEn") ?? "",
      descriptionMn: formData.get("descriptionMn") ?? "",
      durationMinutes: formData.get("durationMinutes") ?? "",
      priceMnt: formData.get("priceMnt") ?? "",
      modality: formData.get("modality") ?? ConsultationModality.ONLINE,
      isActive: formData.get("isActive") !== "off",
    });
    if (!parsed.ok) return parsed.state;
    await createOfferingUseCase(actor, parsed.data, offeringDeps, await getClientIp());
    revalidatePath("/lawyer/offerings");
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function updateOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const offeringId = String(formData.get("offeringId") ?? "");
    const parsed = parseWithSchema(upsertOfferingSchema, {
      titleMn: formData.get("titleMn") ?? "",
      titleEn: formData.get("titleEn") ?? "",
      descriptionMn: formData.get("descriptionMn") ?? "",
      durationMinutes: formData.get("durationMinutes") ?? "",
      priceMnt: formData.get("priceMnt") ?? "",
      modality: formData.get("modality") ?? ConsultationModality.ONLINE,
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.ok) return parsed.state;
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
    return mapActionError(error);
  }
}

export async function deleteOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `offering:write:${actor.userId}`,
      OFFERING_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
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
    return mapActionError(error);
  }
}

export async function createAvailabilityRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(createAvailabilityRuleSchema, {
      dayOfWeek: formData.get("dayOfWeek") ?? "",
      startTime: formData.get("startTime") ?? "",
      endTime: formData.get("endTime") ?? "",
    });
    if (!parsed.ok) return parsed.state;
    await createAvailabilityRuleUseCase(
      actor,
      parsed.data,
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/profile");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function deleteAvailabilityRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    await deleteAvailabilityRuleUseCase(
      actor,
      String(formData.get("ruleId") ?? ""),
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/profile");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function createAvailabilityExceptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(createAvailabilityExceptionSchema, {
      exceptionDate: formData.get("exceptionDate") ?? "",
      startTime: formData.get("startTime") ?? "",
      endTime: formData.get("endTime") ?? "",
      isAvailable: formData.get("isAvailable") === "on",
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.ok) return parsed.state;
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
    revalidatePath("/lawyer/profile");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function deleteAvailabilityExceptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `availability:write:${actor.userId}`,
      AVAILABILITY_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    await deleteAvailabilityExceptionUseCase(
      actor,
      String(formData.get("exceptionId") ?? ""),
      availabilityDeps,
      await getClientIp(),
    );
    revalidatePath("/lawyer/profile");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function setLawyerTaxonomyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `taxonomy:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const practiceAreaIds = formData.getAll("practiceAreaIds").map(String);
    const languageIds = formData.getAll("languageIds").map(String);
    const parsed = parseWithSchema(setLawyerTaxonomySchema, {
      practiceAreaIds,
      languageIds,
    });
    if (!parsed.ok) return parsed.state;
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
    return mapActionError(error);
  }
}

export async function createBookingRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const limited = await enforceRateLimit(
      `booking:create:${actor.userId}`,
      BOOKING_CREATE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(createBookingRequestSchema, {
      lawyerSlug: formData.get("lawyerSlug") ?? "",
      offeringId: formData.get("offeringId") ?? "",
      scheduledStartAt: formData.get("scheduledStartAt") ?? "",
      issueSummary: formData.get("issueSummary") ?? "",
      practiceAreaId: formData.get("practiceAreaId") ?? "",
    });
    if (!parsed.ok) return parsed.state;
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
    return mapActionError(error);
  }
}

export async function respondBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `booking:respond:${actor.userId}`,
      BOOKING_RESPOND_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(respondBookingSchema, {
      bookingId: formData.get("bookingId") ?? "",
      decision: formData.get("decision") ?? "",
      declineReason: formData.get("declineReason") ?? "",
    });
    if (!parsed.ok) return parsed.state;
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
    return mapActionError(error);
  }
}

export async function getMarketplaceFilterOptions() {
  const [practiceAreas, languages] = await Promise.all([
    practiceAreaRepository.findAllActive(),
    languageRepository.findAllActive(),
  ]);
  return { practiceAreas, languages };
}
