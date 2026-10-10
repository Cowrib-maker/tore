import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBookingRequestUseCase, respondToBookingRequestUseCase } from "@/application/use-cases/bookings/booking-requests";
import { UserRole } from "@/domain/enums";
import { prisma } from "@/infrastructure/database/prisma";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  auditLogRepository,
  availabilityRepository,
  bookingRepository,
  consultationOfferingRepository,
  lawyerProfileRepository,
  notificationRepository,
  platformSettingRepository,
} from "@/infrastructure/repositories";

/**
 * Real-Postgres proof that two clients cannot book overlapping time with the
 * same lawyer, however many requests race. In-memory repositories cannot show
 * this: the guarantee is a property of the transaction/locking strategy.
 */
const RACERS = 12;
const tag = randomUUID().slice(0, 8);
const deps = {
  lawyerProfileRepository,
  consultationOfferingRepository,
  availabilityRepository,
  bookingRepository,
  notificationRepository,
  auditLogRepository,
  platformSettingRepository,
  unitOfWork,
};

let slug = "";
let offeringId = "";
let lawyerProfileId = "";
let lawyerUserId = "";
const clientIds: string[] = [];
const created: string[] = [];

function nextDaySlotStart(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const lawyerUser = await prisma.user.create({
    data: { email: `lawyer-${tag}@race.test`, role: "LAWYER", status: "ACTIVE", name: "Race Lawyer" },
  });
  created.push(lawyerUser.id);
  lawyerUserId = lawyerUser.id;
  slug = `race-${tag}`;
  const profile = await prisma.lawyerProfile.create({
    data: { userId: lawyerUser.id, slug, verificationStatus: "APPROVED", isListed: true, position: "ATTORNEY", verifiedAt: new Date() },
  });
  lawyerProfileId = profile.id;
  const offering = await prisma.consultationOffering.create({
    data: { lawyerProfileId, titleMn: "Зөвлөгөө", durationMinutes: 60, priceMnt: 0, modality: "ONLINE", isActive: true },
  });
  offeringId = offering.id;
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
  await prisma.availabilityRule.createMany({
    data: days.map((dayOfWeek) => ({
      lawyerProfileId,
      dayOfWeek,
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T20:00:00.000Z"),
    })),
  });
  for (let i = 0; i < RACERS; i += 1) {
    const u = await prisma.user.create({ data: { email: `client-${tag}-${i}@race.test`, role: "CLIENT", status: "ACTIVE", name: `Client ${i}` } });
    clientIds.push(u.id);
    created.push(u.id);
  }
});

afterAll(async () => {
  await prisma.bookingStatusHistory.deleteMany({ where: { booking: { lawyerProfileId } } });
  await prisma.notification.deleteMany({ where: { userId: { in: created } } });
  await prisma.booking.deleteMany({ where: { lawyerProfileId } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created } } });
  await prisma.availabilityRule.deleteMany({ where: { lawyerProfileId } });
  await prisma.consultationOffering.deleteMany({ where: { lawyerProfileId } });
  await prisma.lawyerProfile.deleteMany({ where: { id: lawyerProfileId } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("booking concurrency (real Postgres)", () => {
  it("exactly one of N concurrent requests for the same slot wins; no overlap is ever persisted", async () => {
    const start = nextDaySlotStart().toISOString();
    const results = await Promise.allSettled(
      clientIds.map((id) =>
        createBookingRequestUseCase(
          { userId: id, role: UserRole.CLIENT },
          { lawyerSlug: slug, offeringId, scheduledStartAt: start, issueSummary: "Concurrent booking race — twenty chars minimum." },
          deps,
        ),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter((r) => r.status === "rejected" && /no longer available/i.test(String((r as PromiseRejectedResult).reason?.message)));
    const rows = await prisma.booking.findMany({ where: { lawyerProfileId } });
    expect(rows).toHaveLength(ok.length);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(RACERS - 1);
  });

  it("partially overlapping slots also cannot both be booked", async () => {
    const base = nextDaySlotStart();
    base.setUTCDate(base.getUTCDate() + 1);
    const starts = [0, 30].map((m) => new Date(base.getTime() + m * 60_000).toISOString());
    const results = await Promise.allSettled(
      starts.flatMap((s, i) =>
        [clientIds[i * 2]!, clientIds[i * 2 + 1]!].map((id) =>
          createBookingRequestUseCase(
            { userId: id, role: UserRole.CLIENT },
            { lawyerSlug: slug, offeringId, scheduledStartAt: s, issueSummary: "Overlap race — twenty chars minimum here." },
            deps,
          ),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("a request is answered exactly once: concurrent accept/decline cannot both apply, and another lawyer cannot answer it", async () => {
    const base = nextDaySlotStart();
    base.setUTCDate(base.getUTCDate() + 2);
    const booking = await createBookingRequestUseCase(
      { userId: clientIds[0]!, role: UserRole.CLIENT },
      { lawyerSlug: slug, offeringId, scheduledStartAt: base.toISOString(), issueSummary: "Respond race — twenty chars minimum here." },
      deps,
    );
    const lawyer = { userId: lawyerUserId, role: UserRole.LAWYER };
    const attempts = [
      ...Array.from({ length: 4 }, () => respondToBookingRequestUseCase(lawyer, { bookingId: booking.id, decision: "ACCEPT" }, deps)),
      ...Array.from({ length: 4 }, () => respondToBookingRequestUseCase(lawyer, { bookingId: booking.id, decision: "REJECT", declineReason: "Not available" }, deps)),
    ];
    const results = await Promise.allSettled(attempts);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const history = await prisma.bookingStatusHistory.findMany({ where: { bookingId: booking.id, fromStatus: "PENDING_ACCEPTANCE" } });
    expect(history).toHaveLength(1);

    const stranger = await prisma.user.create({ data: { email: `other-${tag}@race.test`, role: "LAWYER", status: "ACTIVE", name: "Other" } });
    created.push(stranger.id);
    await prisma.lawyerProfile.create({ data: { userId: stranger.id, slug: `other-${tag}`, verificationStatus: "APPROVED", isListed: true } });
    await expect(
      respondToBookingRequestUseCase({ userId: stranger.id, role: UserRole.LAWYER }, { bookingId: booking.id, decision: "ACCEPT" }, deps),
    ).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND/i) });
    await prisma.lawyerProfile.deleteMany({ where: { userId: stranger.id } });
  });

  const book = (clientId: string, start: Date, minutesOffset = 0) =>
    createBookingRequestUseCase(
      { userId: clientId, role: UserRole.CLIENT },
      { lawyerSlug: slug, offeringId, scheduledStartAt: new Date(start.getTime() + minutesOffset * 60_000).toISOString(), issueSummary: "Scenario test booking — twenty chars minimum." },
      deps,
    );
  const dayStart = (daysAhead: number, hourUtc = 9) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d;
  };

  it("adjacent slots (back to back) can both be booked", async () => {
    const s0 = dayStart(8, 9);
    await book(clientIds[0]!, s0, 0); // 09:00–10:00
    await expect(book(clientIds[1]!, s0, 60)).resolves.toBeTruthy(); // 10:00–11:00
  });

  it("a declined or cancelled request frees its slot; an accepted one keeps it blocked", async () => {
    const lawyer = { userId: lawyerUserId, role: UserRole.LAWYER };
    const s0 = dayStart(9, 9);
    const first = await book(clientIds[2]!, s0);
    await expect(book(clientIds[3]!, s0)).rejects.toThrow(/no longer available/i);
    await respondToBookingRequestUseCase(lawyer, { bookingId: first.id, decision: "REJECT", declineReason: "Busy that day" }, deps);
    const second = await book(clientIds[3]!, s0);
    await respondToBookingRequestUseCase(lawyer, { bookingId: second.id, decision: "ACCEPT" }, deps);
    await expect(book(clientIds[4]!, s0)).rejects.toThrow(/no longer available/i);
    await prisma.booking.update({ where: { id: second.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await expect(book(clientIds[4]!, s0)).resolves.toBeTruthy();
    const confirmed = await prisma.booking.count({ where: { lawyerProfileId, scheduledStartAt: s0, status: { in: ["CONFIRMED", "PENDING_ACCEPTANCE"] } } });
    expect(confirmed).toBe(1);
  });

  it("10 clients race for the same slot twice in a row: exactly one winner each time", async () => {
    for (const day of [10, 11]) {
      const s0 = dayStart(day, 12);
      const results = await Promise.allSettled(clientIds.slice(0, 10).map((id) => book(id, s0)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    }
  });
});
