import { describe, expect, it, vi } from "vitest";

import { completePaidConsultationBooking } from "@/application/use-cases/billing/complete-paid-consultation";
import { BookingStatus, InvoiceStatus } from "@/domain/enums";
import type { Invoice } from "@/domain/entities/invoice";

describe("completePaidConsultationBooking", () => {
  it("moves a paid consultation booking into the lawyer inbox", async () => {
    const updateStatus = vi.fn().mockResolvedValue({
      id: "b1",
      status: BookingStatus.PENDING_ACCEPTANCE,
      bookingNumber: "TORE-1",
    });
    const notify = vi.fn();
    const invoice: Invoice = {
      id: "inv1",
      userId: "client1",
      subscriptionId: null,
      bookingId: "b1",
      planCode: null,
      amountMnt: 180000,
      currency: "MNT",
      provider: "qpay",
      providerInvoiceId: "q1",
      status: InvoiceStatus.PAID,
      expiresAt: new Date(),
      qrText: "qr",
      qrImage: "img",
      shortUrl: null,
      deeplinks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await completePaidConsultationBooking(invoice, {
      bookingRepository: {
        findById: vi.fn().mockResolvedValue({
          id: "b1",
          bookingNumber: "TORE-1",
          clientUserId: "client1",
          lawyerProfileId: "lp1",
          status: BookingStatus.PENDING_PAYMENT,
        }),
        updateStatus,
        recordStatusChange: vi.fn().mockResolvedValue(undefined),
      } as never,
      lawyerProfileRepository: {
        findById: vi.fn().mockResolvedValue({ userId: "lawyer1" }),
      } as never,
      notificationRepository: { create: notify } as never,
    });

    expect(updateStatus).toHaveBeenCalledWith(
      "b1",
      BookingStatus.PENDING_ACCEPTANCE,
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "lawyer1" }),
    );
  });
});
