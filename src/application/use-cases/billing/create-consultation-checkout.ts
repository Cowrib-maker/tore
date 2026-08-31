import type { ActorContext } from "@/application/common/actor-context";
import { QPAY_UNAVAILABLE_MESSAGE } from "@/application/common/public-service-errors";
import {
  SOLO_INVOICE_TTL_MS,
  toSoloCheckoutView,
  type SoloCheckoutView,
} from "@/application/use-cases/billing/checkout-view";
import { BILLING_PROVIDER_QPAY, InvoiceStatus, UserRole } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";

export type CreateConsultationCheckoutDeps = {
  invoiceRepository: InvoiceRepository;
  qpayGateway: QpayGateway;
  qpayCallbackUrl: string;
};

export async function createConsultationCheckout(
  actor: ActorContext,
  input: {
    bookingId: string;
    amountMnt: number;
    description: string;
  },
  deps: CreateConsultationCheckoutDeps,
  now: Date = new Date(),
): Promise<SoloCheckoutView> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }
  if (!Number.isFinite(input.amountMnt) || input.amountMnt <= 0) {
    throw new ValidationError("Consultation fee must be a positive amount.");
  }

  const existing = await deps.invoiceRepository.findByBookingId(input.bookingId);
  if (
    existing &&
    existing.status === InvoiceStatus.PENDING &&
    existing.expiresAt.getTime() > now.getTime() &&
    existing.providerInvoiceId &&
    existing.qrText
  ) {
    return toSoloCheckoutView(existing);
  }

  const invoice = await deps.invoiceRepository.create({
    userId: actor.userId,
    bookingId: input.bookingId,
    planCode: null,
    amountMnt: input.amountMnt,
    currency: SOLO_INVOICE_CURRENCY,
    provider: BILLING_PROVIDER_QPAY,
    status: InvoiceStatus.PENDING,
    expiresAt: new Date(now.getTime() + SOLO_INVOICE_TTL_MS),
  });

  try {
    const created = await deps.qpayGateway.createInvoice({
      senderInvoiceNo: invoice.id,
      amountMnt: input.amountMnt,
      description: input.description.slice(0, 240),
      callbackUrl: deps.qpayCallbackUrl,
    });
    const attached = await deps.invoiceRepository.attachProviderInvoice(
      invoice.id,
      {
        providerInvoiceId: created.providerInvoiceId,
        qrText: created.qrText,
        qrImage: created.qrImage,
        shortUrl: created.shortUrl,
        deeplinks: created.urls,
      },
    );
    return toSoloCheckoutView(attached);
  } catch (error) {
    await deps.invoiceRepository
      .updateStatus(invoice.id, InvoiceStatus.FAILED)
      .catch(() => undefined);
    if (error instanceof PaymentVerificationError) {
      throw error;
    }
    throw new PaymentVerificationError(
      QPAY_UNAVAILABLE_MESSAGE,
      "QPAY_UNAVAILABLE",
      503,
    );
  }
}
