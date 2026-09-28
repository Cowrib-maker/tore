import type {
  Booking,
  CancelBookingInput,
  CreateBookingInput,
  DeclineBookingInput,
  RecordBookingStatusChangeInput,
} from "@/domain/entities/booking";
import type { BookingStatus } from "@/domain/enums";
import type { InstantSlot } from "@/domain/value-objects/time-slot";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";

export interface BookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByBookingNumber(bookingNumber: string): Promise<Booking | null>;
  findByClientUserId(
    clientUserId: string,
    status?: BookingStatus,
    options?: ListPageOptions,
  ): Promise<ListPage<Booking>>;
  findByLawyerProfileId(
    lawyerProfileId: string,
    status?: BookingStatus,
    options?: ListPageOptions,
  ): Promise<ListPage<Booking>>;
  /** Active bookings overlapping [from, to) — used for public slot generation. */
  findBusyForLawyerInRange(
    lawyerProfileId: string,
    from: Date,
    to: Date,
  ): Promise<Booking[]>;
  findOverlappingForLawyer(
    lawyerProfileId: string,
    slot: InstantSlot,
    excludeBookingId?: string,
  ): Promise<Booking[]>;
  bookingNumberExists(bookingNumber: string): Promise<boolean>;
  /** Platform-wide count per status, for the admin dashboard. Zero-filled for every status. */
  countByStatus(): Promise<Record<BookingStatus, number>>;
  /**
   * Exact count for one lawyer + status — a real COUNT query, never a
   * capped page length. `range` narrows to bookings whose scheduledStartAt
   * falls within [from, to).
   */
  countByLawyerProfileIdAndStatus(
    lawyerProfileId: string,
    status: BookingStatus,
    range?: { from: Date; to: Date },
  ): Promise<number>;
  /**
   * The nearest `limit` bookings at or after `from`, ascending by
   * scheduledStartAt — for "upcoming" style UI lists, where the caller
   * needs the soonest bookings specifically (not an arbitrary page).
   */
  findUpcomingForLawyer(
    lawyerProfileId: string,
    status: BookingStatus,
    from: Date,
    limit: number,
  ): Promise<Booking[]>;
  create(input: CreateBookingInput): Promise<Booking>;
  updateStatus(id: string, status: BookingStatus): Promise<Booking>;
  accept(id: string): Promise<Booking>;
  decline(id: string, input: DeclineBookingInput): Promise<Booking>;
  cancel(id: string, input: CancelBookingInput): Promise<Booking>;
  complete(id: string): Promise<Booking>;
  recordStatusChange(input: RecordBookingStatusChangeInput): Promise<void>;
}
