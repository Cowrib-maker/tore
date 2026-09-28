import { afterEach, describe, expect, it, vi } from "vitest";

import type { Booking } from "@/domain/entities/booking";
import { BookingStatus, UserRole } from "@/domain/enums";
import { loadLawyerWorkspaceHome } from "@/application/use-cases/case-review/load-lawyer-workspace-home";

/**
 * Regression coverage for the "furthest-out bookings crowd out the nearest
 * upcoming one" bug: the schedule must be built from real COUNT/ASC-ordered
 * queries, never from re-slicing a DESC-ordered take:N page.
 */

function makeBooking(overrides: Partial<Booking> & { id: string }): Booking {
  return {
    bookingNumber: `BK-${overrides.id}`,
    clientUserId: "client-1",
    lawyerProfileId: "lawyer-profile-1",
    offeringId: "offering-1",
    practiceAreaId: null,
    status: BookingStatus.CONFIRMED,
    issueSummary: "Test booking",
    scheduledStartAt: new Date(),
    scheduledEndAt: new Date(),
    acceptedAt: null,
    declinedAt: null,
    declineReason: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A faithful in-memory stand-in for PrismaBookingRepository's two schedule
 * queries — real filter/sort/slice logic, not canned return values — so
 * these tests actually exercise the semantics loadSchedule depends on. */
function fakeBookingRepository(bookings: Booking[]) {
  return {
    countByLawyerProfileIdAndStatus: vi.fn(
      async (
        lawyerProfileId: string,
        status: BookingStatus,
        range?: { from: Date; to: Date },
      ) =>
        bookings.filter(
          (b) =>
            b.lawyerProfileId === lawyerProfileId &&
            b.status === status &&
            (!range ||
              (b.scheduledStartAt.getTime() >= range.from.getTime() &&
                b.scheduledStartAt.getTime() < range.to.getTime())),
        ).length,
    ),
    findUpcomingForLawyer: vi.fn(
      async (
        lawyerProfileId: string,
        status: BookingStatus,
        from: Date,
        limit: number,
      ) =>
        bookings
          .filter(
            (b) =>
              b.lawyerProfileId === lawyerProfileId &&
              b.status === status &&
              b.scheduledStartAt.getTime() >= from.getTime(),
          )
          .sort(
            (a, b) =>
              a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
          )
          .slice(0, limit),
    ),
  };
}

function emptyCaseAiDeps() {
  return {
    repository: { listByOwnerLawyerId: vi.fn().mockResolvedValue([]) },
    store: {
      listOwnedRecentConversations: vi.fn().mockResolvedValue([]),
      listOwnedCaseConversations: vi.fn().mockResolvedValue([]),
    },
  } as never;
}

const actor = { userId: "lawyer-user-1", role: UserRole.LAWYER };

describe("loadLawyerWorkspaceHome — schedule", () => {
  it("A: the nearest upcoming booking survives past 20+ further-out confirmed bookings", async () => {
    const now = new Date();
    // 25 confirmed bookings on each of the next 25 days — none is "today".
    const farFuture = Array.from({ length: 25 }, (_, i) =>
      makeBooking({
        id: `far-${i}`,
        status: BookingStatus.CONFIRMED,
        scheduledStartAt: new Date(now.getTime() + (i + 2) * 86_400_000),
        scheduledEndAt: new Date(now.getTime() + (i + 2) * 86_400_000 + 3_600_000),
      }),
    );
    // The genuinely nearest booking — later today.
    const nearest = makeBooking({
      id: "nearest",
      status: BookingStatus.CONFIRMED,
      scheduledStartAt: new Date(now.getTime() + 60_000),
      scheduledEndAt: new Date(now.getTime() + 3_660_000),
    });

    const bookingRepository = fakeBookingRepository([...farFuture, nearest]);
    const lawyerProfileRepository = {
      findByUserId: vi.fn().mockResolvedValue({ id: "lawyer-profile-1", timezone: "UTC" }),
    };

    const view = await loadLawyerWorkspaceHome(actor, emptyCaseAiDeps(), {
      bookingRepository: bookingRepository as never,
      lawyerProfileRepository: lawyerProfileRepository as never,
    });

    expect(view.schedule.upcoming[0]?.id).toBe("nearest");
  });

  it("B: today's confirmed count is correct with 20+ other future bookings", async () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const farFuture = Array.from({ length: 22 }, (_, i) =>
      makeBooking({
        id: `far-${i}`,
        status: BookingStatus.CONFIRMED,
        scheduledStartAt: new Date(now.getTime() + (i + 2) * 86_400_000),
        scheduledEndAt: new Date(now.getTime() + (i + 2) * 86_400_000 + 3_600_000),
      }),
    );
    const laterToday1 = makeBooking({
      id: "today-1",
      status: BookingStatus.CONFIRMED,
      scheduledStartAt: new Date(now.getTime() + 30 * 60_000),
      scheduledEndAt: new Date(now.getTime() + 90 * 60_000),
    });
    const laterToday2 = makeBooking({
      id: "today-2",
      status: BookingStatus.CONFIRMED,
      scheduledStartAt: new Date(now.getTime() + 2 * 3_600_000),
      scheduledEndAt: new Date(now.getTime() + 3 * 3_600_000),
    });
    void todayStart;

    const bookingRepository = fakeBookingRepository([
      ...farFuture,
      laterToday1,
      laterToday2,
    ]);
    const lawyerProfileRepository = {
      findByUserId: vi.fn().mockResolvedValue({ id: "lawyer-profile-1", timezone: "UTC" }),
    };

    const view = await loadLawyerWorkspaceHome(actor, emptyCaseAiDeps(), {
      bookingRepository: bookingRepository as never,
      lawyerProfileRepository: lawyerProfileRepository as never,
    });

    expect(view.schedule.todaysConfirmedCount).toBe(2);
  });

  it("C: pending booking count is exact and not capped at the old 50-row page size", async () => {
    const now = new Date();
    const pending = Array.from({ length: 63 }, (_, i) =>
      makeBooking({
        id: `pending-${i}`,
        status: BookingStatus.PENDING_ACCEPTANCE,
        scheduledStartAt: new Date(now.getTime() + (i + 1) * 3_600_000),
        scheduledEndAt: new Date(now.getTime() + (i + 2) * 3_600_000),
      }),
    );

    const bookingRepository = fakeBookingRepository(pending);
    const lawyerProfileRepository = {
      findByUserId: vi.fn().mockResolvedValue({ id: "lawyer-profile-1", timezone: "UTC" }),
    };

    const view = await loadLawyerWorkspaceHome(actor, emptyCaseAiDeps(), {
      bookingRepository: bookingRepository as never,
      lawyerProfileRepository: lawyerProfileRepository as never,
    });

    expect(view.schedule.pendingBookingCount).toBe(63);
  });

  it("omits schedule data safely (zeroed) when scheduleDeps is not provided", async () => {
    const view = await loadLawyerWorkspaceHome(actor, emptyCaseAiDeps());
    expect(view.schedule).toEqual({
      pendingBookingCount: 0,
      todaysConfirmedCount: 0,
      upcoming: [],
    });
  });

  describe("timezone correctness", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("D: a booking near UTC midnight is classified by the lawyer's own configured timezone, not UTC", async () => {
      // "now" = 2026-01-15T17:00:00Z = 2026-01-16 01:00 in Asia/Ulaanbaatar
      // (UTC+8) — the lawyer's calendar day is already Jan 16.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T17:00:00.000Z"));

      // UA-yesterday (Jan 15, 23:30 UA) — a naive UTC-day boundary would
      // wrongly count this as "today" (it's still Jan 15 in plain UTC).
      const uaYesterday = makeBooking({
        id: "ua-yesterday",
        status: BookingStatus.CONFIRMED,
        scheduledStartAt: new Date("2026-01-15T15:30:00.000Z"),
        scheduledEndAt: new Date("2026-01-15T16:30:00.000Z"),
      });
      // UA-today (Jan 16, 00:30 UA) — genuinely today for the lawyer.
      const uaToday = makeBooking({
        id: "ua-today",
        status: BookingStatus.CONFIRMED,
        scheduledStartAt: new Date("2026-01-15T16:30:00.000Z"),
        scheduledEndAt: new Date("2026-01-15T17:30:00.000Z"),
      });

      const bookingRepository = fakeBookingRepository([uaYesterday, uaToday]);
      const lawyerProfileRepository = {
        findByUserId: vi
          .fn()
          .mockResolvedValue({ id: "lawyer-profile-1", timezone: "Asia/Ulaanbaatar" }),
      };

      const view = await loadLawyerWorkspaceHome(actor, emptyCaseAiDeps(), {
        bookingRepository: bookingRepository as never,
        lawyerProfileRepository: lawyerProfileRepository as never,
      });

      expect(view.schedule.todaysConfirmedCount).toBe(1);

      const confirmedCountCall = (
        bookingRepository.countByLawyerProfileIdAndStatus as ReturnType<
          typeof vi.fn
        >
      ).mock.calls.find((call) => call[1] === BookingStatus.CONFIRMED);
      const range = confirmedCountCall?.[2] as { from: Date; to: Date };
      expect(range.from.toISOString()).toBe("2026-01-15T16:00:00.000Z"); // 2026-01-16 00:00 UA
      expect(range.to.toISOString()).toBe("2026-01-16T16:00:00.000Z"); // 2026-01-17 00:00 UA
    });
  });
});
