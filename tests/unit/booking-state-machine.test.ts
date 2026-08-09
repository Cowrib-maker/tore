import { describe, expect, it } from "vitest";

import { BookingStatus } from "@/domain/enums";
import {
  canTransitionBooking,
  getAllowedBookingTransitions,
  isActiveBookingStatus,
  isTerminalBookingStatus,
} from "@/domain/services/booking-state-machine";

describe("booking-state-machine", () => {
  it("allows the happy-path transitions", () => {
    expect(
      canTransitionBooking(
        BookingStatus.DRAFT,
        BookingStatus.PENDING_PAYMENT,
      ),
    ).toBe(true);
    expect(
      canTransitionBooking(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.PENDING_ACCEPTANCE,
      ),
    ).toBe(true);
    expect(
      canTransitionBooking(
        BookingStatus.PENDING_ACCEPTANCE,
        BookingStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      canTransitionBooking(
        BookingStatus.CONFIRMED,
        BookingStatus.IN_PROGRESS,
      ),
    ).toBe(true);
    expect(
      canTransitionBooking(
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
      ),
    ).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(
      canTransitionBooking(BookingStatus.DRAFT, BookingStatus.COMPLETED),
    ).toBe(false);
    expect(
      canTransitionBooking(BookingStatus.REFUNDED, BookingStatus.CONFIRMED),
    ).toBe(false);
  });

  it("allows Sprint 4 request path without payment", () => {
    expect(
      canTransitionBooking(
        BookingStatus.DRAFT,
        BookingStatus.PENDING_ACCEPTANCE,
      ),
    ).toBe(true);
    expect(
      canTransitionBooking(
        BookingStatus.PENDING_ACCEPTANCE,
        BookingStatus.CANCELLED,
      ),
    ).toBe(true);
  });

  it("exposes allowed transitions and terminal helpers", () => {
    expect(getAllowedBookingTransitions(BookingStatus.REFUNDED)).toEqual([]);
    expect(isTerminalBookingStatus(BookingStatus.REFUNDED)).toBe(true);
    expect(isActiveBookingStatus(BookingStatus.CONFIRMED)).toBe(true);
    expect(isActiveBookingStatus(BookingStatus.COMPLETED)).toBe(false);
  });
});
