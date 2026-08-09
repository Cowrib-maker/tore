import type { Booking } from "@/domain/entities/booking";
import type { BookingStatus } from "@/domain/enums";

type BookingRecord = {
  id: string;
  bookingNumber: string;
  clientUserId: string;
  lawyerProfileId: string;
  offeringId: string;
  practiceAreaId: string | null;
  status: string;
  issueSummary: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancelledByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapBooking(record: BookingRecord): Booking {
  return {
    id: record.id,
    bookingNumber: record.bookingNumber,
    clientUserId: record.clientUserId,
    lawyerProfileId: record.lawyerProfileId,
    offeringId: record.offeringId,
    practiceAreaId: record.practiceAreaId,
    status: record.status as BookingStatus,
    issueSummary: record.issueSummary,
    scheduledStartAt: record.scheduledStartAt,
    scheduledEndAt: record.scheduledEndAt,
    acceptedAt: record.acceptedAt,
    declinedAt: record.declinedAt,
    declineReason: record.declineReason,
    completedAt: record.completedAt,
    cancelledAt: record.cancelledAt,
    cancellationReason: record.cancellationReason,
    cancelledByUserId: record.cancelledByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const bookingSelect = {
  id: true,
  bookingNumber: true,
  clientUserId: true,
  lawyerProfileId: true,
  offeringId: true,
  practiceAreaId: true,
  status: true,
  issueSummary: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  acceptedAt: true,
  declinedAt: true,
  declineReason: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  cancelledByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;
