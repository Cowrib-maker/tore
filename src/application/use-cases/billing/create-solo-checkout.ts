import type { ActorContext } from "@/application/common/actor-context";
import { assertLawyerEntitlementActor } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import {
  SOLO_INVOICE_DESCRIPTION,
  SOLO_INVOICE_TTL_MS,
  toSoloCheckoutView,
  type SoloCheckoutView,
} from "@/application/use-cases/billing/checkout-view";
import { SOLO_PLAN } from "@/domain/constants/subscription-plans";
import { BILLING_PROVIDER_QPAY, InvoiceStatus } from "@/domain/enums";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";

export type CreateSoloCheckoutDeps = {
  invoiceRepository: InvoiceRepository;
  qpayGateway: QpayGateway;
  qpayCallbackUrl: string;
};

export async function createSoloCheckout(
  actor: ActorContext,
  deps: CreateSoloCheckoutDeps,
  now: Date = new Date(),
): Promise<SoloCheckoutView> {
  assertLawyerEntitlementActor(actor);

  const existing = await deps.invoiceRepository.findLatestPendingForUser(
    actor.userId,
    now,
  );
  if (existing?.providerInvoiceId && existing.qrText) {
    return toSoloCheckoutView(existing);
  }

  const invoice = await deps.invoiceRepository.create({
    userId: actor.userId,
    planCode: SOLO_PLAN.code,
    amountMnt: SOLO_PLAN.priceMnt,
    currency: SOLO_INVOICE_CURRENCY,
    provider: BILLING_PROVIDER_QPAY,
    status: InvoiceStatus.PENDING,
    expiresAt: new Date(now.getTime() + SOLO_INVOICE_TTL_MS),
  });

  try {
    const created = await deps.qpayGateway.createInvoice({
      senderInvoiceNo: invoice.id,
      amountMnt: SOLO_PLAN.priceMnt,
      description: SOLO_INVOICE_DESCRIPTION,
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
      "QPay request failed",
      "QPAY_UNAVAILABLE",
      503,
    );
  }
}
