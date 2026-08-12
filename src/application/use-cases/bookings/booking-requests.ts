import type { ActorContext } from "@/application/common/actor-context";
import type { CreateBookingRequestInput } from "@/application/validators/marketplace.schema";
import type { Booking } from "@/domain/entities/booking";
import {
  AuditAction,
  BookingStatus,
  NotificationType,
  UserRole,
} from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { AvailabilityRepository } from "@/domain/repositories/availability-repository";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { ConsultationOfferingRepository } from "@/domain/repositories/consultation-offering-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { NotificationRepository } from "@/domain/repositories/trust-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import {
  assertBookingTransition,
} from "@/domain/services/booking-state-machine";
import {
  DEFAULT_BOOKING_NUMBER_PREFIX,
  formatBookingNumber,
} from "@/domain/services/booking-number";
import { canClientBookLawyer } from "@/domain/services/lawyer-eligibility";
import { isSlotAvailable } from "@/domain/services/slot-availability";

export type BookingRequestDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  consultationOfferingRepository: ConsultationOfferingRepository;
  availabilityRepository: AvailabilityRepository;
  bookingRepository: BookingRepository;
  notificationRepository: NotificationRepository;
  auditLogRepository: AuditLogRepository;
  platformSettingRepository: PlatformSettingRepository;
  unitOfWork: UnitOfWork;
};

export async function createBookingRequestUseCase(
  actor: ActorContext,
  input: CreateBookingRequestInput,
  deps: BookingRequestDeps,
  ipAddress?: string,
): Promise<Booking> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }

  const profile = await deps.lawyerProfileRepository.findBySlug(input.lawyerSlug);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const hasActiveOffering =
    await deps.lawyerProfileRepository.hasActiveOffering(profile.id);
  if (!canClientBookLawyer(profile, hasActiveOffering)) {
    throw new ValidationError("This lawyer is not available for booking");
  }

  const offering = await deps.consultationOfferingRepository.findById(
    input.offeringId,
  );
  if (
    !offering ||
    offering.lawyerProfileId !== profile.id ||
    !offering.isActive
  ) {
    throw new NotFoundError("ConsultationOffering", input.offeringId);
  }

  const startAt = new Date(input.scheduledStartAt);
  const endAt = new Date(
    startAt.getTime() + offering.durationMinutes * 60_000,
  );
  if (Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
    throw new ValidationError("Choose a future time slot");
  }

  const rules =
    await deps.availabilityRepository.findActiveRulesByLawyerProfileId(
      profile.id,
    );
  const from = startAt.toISOString().slice(0, 10);
  const to = endAt.toISOString().slice(0, 10);
  const exceptions =
    await deps.availabilityRepository.findExceptionsByLawyerProfileId(
      profile.id,
      from,
      to,
    );

  const prefixSetting = await deps.platformSettingRepository.findByKey(
    "booking_number_prefix",
  );
  const prefix = prefixSetting?.value ?? DEFAULT_BOOKING_NUMBER_PREFIX;
  let bookingNumber = "";
  for (let i = 0; i < 5; i++) {
    const seq = Date.now() % 100_000_000;
    bookingNumber = formatBookingNumber(prefix, seq + i);
    if (!(await deps.bookingRepository.bookingNumberExists(bookingNumber))) {
      break;
    }
  }

  return deps.unitOfWork.runInTransaction(async (tx) => {
    const overlapping = await tx.bookingRepository.findOverlappingForLawyer(
      profile.id,
      { startAt, endAt },
    );

    if (
      !isSlotAvailable(
        { startAt, endAt },
        rules,
        exceptions,
        overlapping,
      )
    ) {
      throw new ConflictError("That time slot is no longer available");
    }

    const booking = await tx.bookingRepository.create({
      clientUserId: actor.userId,
      lawyerProfileId: profile.id,
      offeringId: offering.id,
      practiceAreaId: input.practiceAreaId || undefined,
      issueSummary: input.issueSummary,
      scheduledStartAt: startAt,
      scheduledEndAt: endAt,
      bookingNumber,
      status: BookingStatus.PENDING_ACCEPTANCE,
    });

    await tx.bookingRepository.recordStatusChange({
      bookingId: booking.id,
      fromStatus: null,
      toStatus: BookingStatus.PENDING_ACCEPTANCE,
      changedByUserId: actor.userId,
      reason: "Client booking request",
    });

    await tx.notificationRepository.create({
      userId: profile.userId,
      type: NotificationType.BOOKING_CREATED,
      title: "New booking request",
      body: `Request ${booking.bookingNumber} is awaiting your response.`,
      metadata: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
      },
    });

    await tx.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.CREATE,
      entityType: "Booking",
      entityId: booking.id,
      metadata: { status: booking.status, bookingNumber },
      ipAddress,
    });

    return booking;
  });
}

export async function respondToBookingRequestUseCase(
  actor: ActorContext,
  input: { bookingId: string; decision: "ACCEPT" | "REJECT"; declineReason?: string },
  deps: BookingRequestDeps,
  ipAddress?: string,
): Promise<Booking> {
  if (actor.role !== UserRole.LAWYER) throw new ForbiddenError();

  const profile = await deps.lawyerProfileRepository.findByUserId(actor.userId);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const booking = await deps.bookingRepository.findById(input.bookingId);
  if (!booking || booking.lawyerProfileId !== profile.id) {
    throw new NotFoundError("Booking", input.bookingId);
  }

  if (booking.status !== BookingStatus.PENDING_ACCEPTANCE) {
    throw new ConflictError("Only pending requests can be accepted or rejected");
  }

  if (input.decision === "ACCEPT") {
    assertBookingTransition(
      BookingStatus.PENDING_ACCEPTANCE,
      BookingStatus.CONFIRMED,
    );
    return deps.unitOfWork.runInTransaction(async (tx) => {
      const updated = await tx.bookingRepository.accept(booking.id);
      await tx.bookingRepository.recordStatusChange({
        bookingId: booking.id,
        fromStatus: BookingStatus.PENDING_ACCEPTANCE,
        toStatus: BookingStatus.CONFIRMED,
        changedByUserId: actor.userId,
      });
      await tx.notificationRepository.create({
        userId: booking.clientUserId,
        type: NotificationType.BOOKING_ACCEPTED,
        title: "Booking accepted",
        body: `Your request ${booking.bookingNumber} was accepted.`,
        metadata: {
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
        },
      });
      await tx.auditLogRepository.create({
        actorUserId: actor.userId,
        action: AuditAction.APPROVE,
        entityType: "Booking",
        entityId: booking.id,
        ipAddress,
      });
      return updated;
    });
  }

  if (!input.declineReason || input.declineReason.trim().length < 3) {
    throw new ValidationError("A rejection reason is required");
  }
  assertBookingTransition(
    BookingStatus.PENDING_ACCEPTANCE,
    BookingStatus.CANCELLED,
  );

  const reason = input.declineReason.trim();
  return deps.unitOfWork.runInTransaction(async (tx) => {
    const updated = await tx.bookingRepository.decline(booking.id, {
      declineReason: reason,
    });
    await tx.bookingRepository.recordStatusChange({
      bookingId: booking.id,
      fromStatus: BookingStatus.PENDING_ACCEPTANCE,
      toStatus: BookingStatus.CANCELLED,
      changedByUserId: actor.userId,
      reason,
    });
    await tx.notificationRepository.create({
      userId: booking.clientUserId,
      type: NotificationType.BOOKING_DECLINED,
      title: "Booking declined",
      body: `Your request ${booking.bookingNumber} was declined. ${reason}`,
      metadata: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        declineReason: reason,
      },
    });
    await tx.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.REJECT,
      entityType: "Booking",
      entityId: booking.id,
      ipAddress,
    });
    return updated;
  });
}
