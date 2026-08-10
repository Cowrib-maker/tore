import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBookingRequestUseCase,
  respondToBookingRequestUseCase,
} from "@/application/use-cases/bookings/booking-requests";
import { BookingStatus, UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/domain/errors/domain-error";

const lawyerProfile = {
  id: "lp1",
  userId: "lawyer1",
  slug: "bat-erdene",
  headline: "Corporate",
  bio: null,
  yearsOfExperience: 10,
  city: "Ulaanbaatar",
  education: null,
  timezone: "Asia/Ulaanbaatar",
  verificationStatus: "APPROVED" as const,
  verifiedAt: new Date(),
  isListed: true,
  averageRating: null,
  reviewCount: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const offering = {
  id: "off1",
  lawyerProfileId: "lp1",
  titleMn: "Зөвлөгөө",
  titleEn: "Consultation",
  descriptionMn: null,
  durationMinutes: 60,
  priceMnt: 180000,
  modality: "ONLINE",
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("booking-request guards", () => {
  const startAt = new Date(Date.now() + 3 * 86400000);
  startAt.setUTCHours(10, 0, 0, 0);

  let deps: Parameters<typeof createBookingRequestUseCase>[2];

  beforeEach(() => {
    const bookingRepository = {
      findOverlappingForLawyer: vi.fn().mockResolvedValue([]),
      bookingNumberExists: vi.fn().mockResolvedValue(false),
      create: vi.fn(),
      recordStatusChange: vi.fn(),
      findById: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
    };
    const notificationRepository = { create: vi.fn() };
    const auditLogRepository = { create: vi.fn() };

    deps = {
      lawyerProfileRepository: {
        findBySlug: vi.fn().mockResolvedValue(lawyerProfile),
        findByUserId: vi.fn().mockResolvedValue(lawyerProfile),
        hasActiveOffering: vi.fn().mockResolvedValue(true),
      } as never,
      consultationOfferingRepository: {
        findById: vi.fn().mockResolvedValue(offering),
      } as never,
      availabilityRepository: {
        findActiveRulesByLawyerProfileId: vi.fn().mockResolvedValue([
          {
            id: "r1",
            lawyerProfileId: "lp1",
            dayOfWeek: [
              "SUNDAY",
              "MONDAY",
              "TUESDAY",
              "WEDNESDAY",
              "THURSDAY",
              "FRIDAY",
              "SATURDAY",
            ][startAt.getUTCDay()],
            startTime: "09:00",
            endTime: "17:00",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        findExceptionsByLawyerProfileId: vi.fn().mockResolvedValue([]),
      } as never,
      bookingRepository: bookingRepository as never,
      notificationRepository: notificationRepository as never,
      auditLogRepository: auditLogRepository as never,
      platformSettingRepository: {
        findByKey: vi.fn().mockResolvedValue(null),
      } as never,
      unitOfWork: {
        runInTransaction: async (work) =>
          work({
            bookingRepository,
            notificationRepository,
            auditLogRepository,
          } as never),
      },
    };
  });

  it("rejects non-client booking creates", async () => {
    await expect(
      createBookingRequestUseCase(
        { userId: "lawyer1", role: UserRole.LAWYER },
        {
          lawyerSlug: "bat-erdene",
          offeringId: "off1",
          scheduledStartAt: startAt.toISOString(),
          issueSummary: "Need help with employment contract review this month.",
          practiceAreaId: "",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects past time slots", async () => {
    await expect(
      createBookingRequestUseCase(
        { userId: "client1", role: UserRole.CLIENT },
        {
          lawyerSlug: "bat-erdene",
          offeringId: "off1",
          scheduledStartAt: new Date(Date.now() - 3600_000).toISOString(),
          issueSummary: "Need help with employment contract review this month.",
          practiceAreaId: "",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects overlapping slots with ConflictError", async () => {
    (
      deps.bookingRepository.findOverlappingForLawyer as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: "busy",
        status: BookingStatus.CONFIRMED,
        scheduledStartAt: startAt,
        scheduledEndAt: new Date(startAt.getTime() + 60 * 60_000),
      },
    ]);

    await expect(
      createBookingRequestUseCase(
        { userId: "client1", role: UserRole.CLIENT },
        {
          lawyerSlug: "bat-erdene",
          offeringId: "off1",
          scheduledStartAt: startAt.toISOString(),
          issueSummary: "Need help with employment contract review this month.",
          practiceAreaId: "",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects non-lawyer responses", async () => {
    await expect(
      respondToBookingRequestUseCase(
        { userId: "client1", role: UserRole.CLIENT },
        { bookingId: "b1", decision: "ACCEPT" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects respond when booking is not pending", async () => {
    (deps.bookingRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "b1",
      lawyerProfileId: "lp1",
      status: BookingStatus.CONFIRMED,
      bookingNumber: "TORE-1",
      clientUserId: "client1",
    });

    await expect(
      respondToBookingRequestUseCase(
        { userId: "lawyer1", role: UserRole.LAWYER },
        { bookingId: "b1", decision: "ACCEPT" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires a decline reason", async () => {
    (deps.bookingRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "b1",
      lawyerProfileId: "lp1",
      status: BookingStatus.PENDING_ACCEPTANCE,
      bookingNumber: "TORE-1",
      clientUserId: "client1",
    });

    await expect(
      respondToBookingRequestUseCase(
        { userId: "lawyer1", role: UserRole.LAWYER },
        { bookingId: "b1", decision: "REJECT", declineReason: "no" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
