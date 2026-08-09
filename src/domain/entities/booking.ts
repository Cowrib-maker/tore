import type { BookingStatus } from "@/domain/enums";

export interface Booking {
  id: string;
  bookingNumber: string;
  clientUserId: string;
  lawyerProfileId: string;
  offeringId: string;
  practiceAreaId: string | null;
  status: BookingStatus;
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
}

export interface CreateBookingInput {
  clientUserId: string;
  lawyerProfileId: string;
  offeringId: string;
  practiceAreaId?: string;
  issueSummary: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  bookingNumber: string;
}

export interface BookingStatusHistory {
  id: string;
  bookingId: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface RecordBookingStatusChangeInput {
  bookingId: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  changedByUserId?: string;
  reason?: string;
}

export interface CancelBookingInput {
  cancellationReason: string;
  cancelledByUserId: string;
}

export interface DeclineBookingInput {
  declineReason: string;
}
