import type { Invoice } from "@/domain/entities/invoice";
import type { Booking } from "@/domain/entities/booking";
import {
  AuditAction,
  BookingStatus,
  InvoiceStatus,
  NotificationType,
} from "@/domain/enums";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { NotificationRepository } from "@/domain/repositories/trust-repository";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import { assertBookingTransition } from "@/domain/services/booking-state-machine";

export type CompletePaidConsultationDeps = {
  bookingRepository: BookingRepository;
  lawyerProfileRepository?: LawyerProfileRepository;
  notificationRepository?: NotificationRepository;
  auditLogRepository?: AuditLogRepository;
};

/**
 * After a consultation QPay invoice is PAID, move the booking to the
 * lawyer's inbox. Safe to call again if the webhook already succeeded.
 */
export async function completePaidConsultationBooking(
  invoice: Invoice,
  deps: CompletePaidConsultationDeps,
): Promise<Booking | null> {
  if (!invoice.bookingId || invoice.status !== InvoiceStatus.PAID) {
    return null;
  }

  const booking = await deps.bookingRepository.findById(invoice.bookingId);
  if (!booking) {
    throw new PaymentVerificationError("Invoice was not found", "WRONG_INVOICE");
  }
  if (booking.clientUserId !== invoice.userId) {
    throw new PaymentVerificationError("Invoice was not found", "WRONG_INVOICE");
  }
  if (booking.status === BookingStatus.PENDING_ACCEPTANCE) {
    return booking;
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    return booking;
  }

  assertBookingTransition(
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PENDING_ACCEPTANCE,
  );
  const updated = await deps.bookingRepository.updateStatus(
    booking.id,
    BookingStatus.PENDING_ACCEPTANCE,
  );
  await deps.bookingRepository.recordStatusChange({
    bookingId: booking.id,
    fromStatus: BookingStatus.PENDING_PAYMENT,
    toStatus: BookingStatus.PENDING_ACCEPTANCE,
    changedByUserId: invoice.userId,
    reason: "Consultation fee paid",
  });

  const lawyer = await deps.lawyerProfileRepository?.findById(
    booking.lawyerProfileId,
  );
  if (lawyer && deps.notificationRepository) {
    await deps.notificationRepository.create({
      userId: lawyer.userId,
      type: NotificationType.BOOKING_CREATED,
      title: "New booking request",
      body: `Request ${booking.bookingNumber} is awaiting your response.`,
      metadata: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
      },
    });
  }
  await deps.auditLogRepository?.create({
    actorUserId: invoice.userId,
    action: AuditAction.CREATE,
    entityType: "Booking",
    entityId: booking.id,
    metadata: { status: updated.status, bookingNumber: booking.bookingNumber },
  });
  return updated;
}
