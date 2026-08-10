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
  create(input: CreateBookingInput): Promise<Booking>;
  updateStatus(id: string, status: BookingStatus): Promise<Booking>;
  accept(id: string): Promise<Booking>;
  decline(id: string, input: DeclineBookingInput): Promise<Booking>;
  cancel(id: string, input: CancelBookingInput): Promise<Booking>;
  complete(id: string): Promise<Booking>;
  recordStatusChange(input: RecordBookingStatusChangeInput): Promise<void>;
}
