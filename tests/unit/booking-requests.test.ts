import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBookingRequestUseCase, respondToBookingRequestUseCase } from "@/application/use-cases/bookings/booking-requests";
import { BookingStatus, NotificationType, UserRole } from "@/domain/enums";
import { InMemoryInvoiceRepository } from "@/infrastructure/repositories/in-memory-invoice-repository";

const lawyerProfile = {
  id: "lp1",
  userId: "lawyer1",
  slug: "bat-erdene",
  headline: "Corporate",
  bio: null,
  yearsOfExperience: 10,
  city: "Ulaanbaatar",
  education: null,
  phone: null,
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

describe("booking-requests", () => {
  const startAt = new Date(Date.now() + 3 * 86400000);
  startAt.setUTCHours(10, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60_000);

  let deps: Parameters<typeof createBookingRequestUseCase>[2];
  let notifyCreate: ReturnType<typeof vi.fn>;
  let bookingCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notifyCreate = vi.fn().mockResolvedValue({});
    bookingCreate = vi.fn().mockResolvedValue({
      id: "b1",
      bookingNumber: "TORE-00000001",
      clientUserId: "client1",
      lawyerProfileId: "lp1",
      offeringId: "off1",
      practiceAreaId: null,
      status: BookingStatus.PENDING_PAYMENT,
      issueSummary: "Need help with employment contract review this month.",
      scheduledStartAt: startAt,
      scheduledEndAt: endAt,
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
      bookingRepository: {
        findOverlappingForLawyer: vi.fn().mockResolvedValue([]),
        bookingNumberExists: vi.fn().mockResolvedValue(false),
        create: bookingCreate,
        recordStatusChange: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn(),
        accept: vi.fn(),
        decline: vi.fn(),
        cancel: vi.fn().mockResolvedValue({}),
      } as never,
      notificationRepository: { create: notifyCreate } as never,
      auditLogRepository: { create: vi.fn().mockResolvedValue({}) } as never,
      platformSettingRepository: {
        findByKey: vi.fn().mockResolvedValue(null),
      } as never,
      consultationCheckout: {
        invoiceRepository: new InMemoryInvoiceRepository(),
        qpayGateway: {
          createInvoice: vi.fn().mockResolvedValue({
            providerInvoiceId: "qpay-consult-1",
            qrText: "qr",
            qrImage: "img",
            shortUrl: "https://qpay.mn/pay",
            urls: [],
          }),
          checkPayment: vi.fn(),
        },
        qpayCallbackUrl: "https://tore.mn/api/billing/qpay/callback",
      },
      unitOfWork: {
        runInTransaction: async (work) =>
          work({
            bookingRepository: deps.bookingRepository,
            notificationRepository: { create: notifyCreate },
            auditLogRepository: deps.auditLogRepository,
          } as never),
      },
    };

    // Wire UoW to the same booking mocks after deps object exists
    deps.unitOfWork = {
      runInTransaction: async (work) =>
        work({
          bookingRepository: deps.bookingRepository,
          notificationRepository: deps.notificationRepository,
          auditLogRepository: deps.auditLogRepository,
        } as never),
    };
  });

  it("creates PENDING_PAYMENT booking and holds lawyer notice until QPay", async () => {
    const booking = await createBookingRequestUseCase(
      { userId: "client1", role: UserRole.CLIENT },
      {
        lawyerSlug: "bat-erdene",
        offeringId: "off1",
        scheduledStartAt: startAt.toISOString(),
        issueSummary: "Need help with employment contract review this month.",
        practiceAreaId: "",
      },
      deps,
    );

    expect(booking.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(bookingCreate).toHaveBeenCalled();
    expect(notifyCreate).not.toHaveBeenCalled();
  });

  it("accepts pending request and notifies client", async () => {
    const pending = {
      id: "b1",
      bookingNumber: "TORE-00000001",
      clientUserId: "client1",
      lawyerProfileId: "lp1",
      offeringId: "off1",
      practiceAreaId: null,
      status: BookingStatus.PENDING_ACCEPTANCE,
      issueSummary: "Need help with employment contract review this month.",
      scheduledStartAt: startAt,
      scheduledEndAt: endAt,
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (deps.bookingRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      pending,
    );
    (deps.bookingRepository.accept as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      status: BookingStatus.CONFIRMED,
      acceptedAt: new Date(),
    });

    const updated = await respondToBookingRequestUseCase(
      { userId: "lawyer1", role: UserRole.LAWYER },
      { bookingId: "b1", decision: "ACCEPT" },
      deps,
    );

    expect(updated.status).toBe(BookingStatus.CONFIRMED);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "client1",
        type: NotificationType.BOOKING_ACCEPTED,
      }),
    );
  });

  it("rejects pending request with reason and notifies client", async () => {
    const pending = {
      id: "b1",
      bookingNumber: "TORE-00000001",
      clientUserId: "client1",
      lawyerProfileId: "lp1",
      offeringId: "off1",
      practiceAreaId: null,
      status: BookingStatus.PENDING_ACCEPTANCE,
      issueSummary: "Need help with employment contract review this month.",
      scheduledStartAt: startAt,
      scheduledEndAt: endAt,
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (deps.bookingRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      pending,
    );
    (deps.bookingRepository.decline as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      status: BookingStatus.CANCELLED,
      declineReason: "Schedule conflict",
    });

    const updated = await respondToBookingRequestUseCase(
      { userId: "lawyer1", role: UserRole.LAWYER },
      {
        bookingId: "b1",
        decision: "REJECT",
        declineReason: "Schedule conflict",
      },
      deps,
    );

    expect(updated.status).toBe(BookingStatus.CANCELLED);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "client1",
        type: NotificationType.BOOKING_DECLINED,
      }),
    );
  });
});
