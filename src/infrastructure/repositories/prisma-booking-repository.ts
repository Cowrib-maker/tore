import type {
  Booking,
  CancelBookingInput,
  CreateBookingInput,
  DeclineBookingInput,
  RecordBookingStatusChangeInput,
} from "@/domain/entities/booking";
import { BookingStatus } from "@/domain/enums";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";
import { resolveTake } from "@/application/common/list-page";
import type { InstantSlot } from "@/domain/value-objects/time-slot";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  bookingSelect,
  mapBooking,
} from "@/infrastructure/mappers/booking.mapper";
import { mapUniqueViolation } from "@/infrastructure/database/prisma-errors";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PENDING_ACCEPTANCE,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
] as const;

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Booking | null> {
    const record = await this.db.booking.findUnique({
      where: { id },
      select: bookingSelect,
    });
    return record ? mapBooking(record) : null;
  }

  async findByBookingNumber(bookingNumber: string): Promise<Booking | null> {
    const record = await this.db.booking.findUnique({
      where: { bookingNumber },
      select: bookingSelect,
    });
    return record ? mapBooking(record) : null;
  }

  async findByClientUserId(
    clientUserId: string,
    status?: BookingStatus,
    options?: ListPageOptions,
  ): Promise<ListPage<Booking>> {
    const take = resolveTake(options);
    const records = await this.db.booking.findMany({
      where: { clientUserId, ...(status ? { status } : {}) },
      take: take + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      orderBy: [{ scheduledStartAt: "desc" }, { id: "desc" }],
      select: bookingSelect,
    });
    const hasMore = records.length > take;
    const page = hasMore ? records.slice(0, take) : records;
    return {
      items: page.map(mapBooking),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async findByLawyerProfileId(
    lawyerProfileId: string,
    status?: BookingStatus,
    options?: ListPageOptions,
  ): Promise<ListPage<Booking>> {
    const take = resolveTake(options);
    const records = await this.db.booking.findMany({
      where: { lawyerProfileId, ...(status ? { status } : {}) },
      take: take + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      orderBy: [{ scheduledStartAt: "desc" }, { id: "desc" }],
      select: bookingSelect,
    });
    const hasMore = records.length > take;
    const page = hasMore ? records.slice(0, take) : records;
    return {
      items: page.map(mapBooking),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async findBusyForLawyerInRange(
    lawyerProfileId: string,
    from: Date,
    to: Date,
  ): Promise<Booking[]> {
    const records = await this.db.booking.findMany({
      where: {
        lawyerProfileId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        scheduledStartAt: { lt: to },
        scheduledEndAt: { gt: from },
      },
      select: bookingSelect,
    });
    return records.map(mapBooking);
  }

  async findOverlappingForLawyer(
    lawyerProfileId: string,
    slot: InstantSlot,
    excludeBookingId?: string,
  ): Promise<Booking[]> {
    const records = await this.db.booking.findMany({
      where: {
        lawyerProfileId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        scheduledStartAt: { lt: slot.endAt },
        scheduledEndAt: { gt: slot.startAt },
      },
      select: bookingSelect,
    });
    return records.map(mapBooking);
  }

  async bookingNumberExists(bookingNumber: string): Promise<boolean> {
    const count = await this.db.booking.count({ where: { bookingNumber } });
    return count > 0;
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    try {
      const record = await this.db.booking.create({
        data: {
          bookingNumber: input.bookingNumber,
          clientUserId: input.clientUserId,
          lawyerProfileId: input.lawyerProfileId,
          offeringId: input.offeringId,
          practiceAreaId: input.practiceAreaId,
          status: input.status,
          issueSummary: input.issueSummary,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
        },
        select: bookingSelect,
      });
      return mapBooking(record);
    } catch (error) {
      mapUniqueViolation(error, "Booking number already exists");
    }
  }

  async updateStatus(id: string, status: BookingStatus): Promise<Booking> {
    const record = await this.db.booking.update({
      where: { id },
      data: { status },
      select: bookingSelect,
    });
    return mapBooking(record);
  }

  async accept(id: string): Promise<Booking> {
    const record = await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CONFIRMED,
        acceptedAt: new Date(),
      },
      select: bookingSelect,
    });
    return mapBooking(record);
  }

  async decline(id: string, input: DeclineBookingInput): Promise<Booking> {
    const record = await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        declinedAt: new Date(),
        declineReason: input.declineReason,
        cancelledAt: new Date(),
        cancellationReason: input.declineReason,
      },
      select: bookingSelect,
    });
    return mapBooking(record);
  }

  async cancel(id: string, input: CancelBookingInput): Promise<Booking> {
    const record = await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: input.cancellationReason,
        cancelledByUserId: input.cancelledByUserId,
      },
      select: bookingSelect,
    });
    return mapBooking(record);
  }

  async complete(id: string): Promise<Booking> {
    const record = await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
      select: bookingSelect,
    });
    return mapBooking(record);
  }

  async recordStatusChange(
    input: RecordBookingStatusChangeInput,
  ): Promise<void> {
    await this.db.bookingStatusHistory.create({
      data: {
        bookingId: input.bookingId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        changedByUserId: input.changedByUserId,
        reason: input.reason,
      },
    });
  }
}

export const bookingRepository = new PrismaBookingRepository();
