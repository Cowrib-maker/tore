import { BookingStatus } from "@/domain/enums";
import { InvalidStateTransitionError } from "@/domain/errors/invalid-state-transition-error";

const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  [BookingStatus.DRAFT]: [
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PENDING_ACCEPTANCE,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PENDING_PAYMENT]: [
    BookingStatus.PENDING_ACCEPTANCE,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PENDING_ACCEPTANCE]: [
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.IN_PROGRESS,
    BookingStatus.CANCELLED,
    BookingStatus.DISPUTED,
  ],
  [BookingStatus.IN_PROGRESS]: [
    BookingStatus.COMPLETED,
    BookingStatus.DISPUTED,
  ],
  [BookingStatus.COMPLETED]: [BookingStatus.DISPUTED],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]: [],
  [BookingStatus.DISPUTED]: [
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.REFUNDED,
  ],
};

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
): void {
  if (!canTransitionBooking(from, to)) {
    throw new InvalidStateTransitionError("Booking", from, to);
  }
}

export function getAllowedBookingTransitions(
  from: BookingStatus,
): readonly BookingStatus[] {
  return BOOKING_TRANSITIONS[from];
}

export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.REFUNDED,
];

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}

export function isActiveBookingStatus(status: BookingStatus): boolean {
  return (
    status === BookingStatus.PENDING_PAYMENT ||
    status === BookingStatus.PENDING_ACCEPTANCE ||
    status === BookingStatus.CONFIRMED ||
    status === BookingStatus.IN_PROGRESS ||
    status === BookingStatus.DISPUTED
  );
}
