import type { ActorContext } from "@/application/common/actor-context";
import {
  CITIZEN_PLAN_PRICE_NOT_CONFIGURED_MESSAGE,
  QPAY_UNAVAILABLE_MESSAGE,
} from "@/application/common/public-service-errors";
import {
  SOLO_INVOICE_TTL_MS,
  toSoloCheckoutView,
  type SoloCheckoutView,
} from "@/application/use-cases/billing/checkout-view";
import {
  CITIZEN_PLANS,
  getPlanDefinition,
  type SubscriptionPlanDefinition,
} from "@/domain/constants/subscription-plans";
import {
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SubscriptionPlanCode,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";

export type CreatePlanCheckoutDeps = {
  invoiceRepository: InvoiceRepository;
  qpayGateway: QpayGateway;
  qpayCallbackUrl: string;
};

export async function createCitizenPlanCheckout(
  actor: ActorContext,
  planCode: string,
  deps: CreatePlanCheckoutDeps,
  now: Date = new Date(),
): Promise<SoloCheckoutView> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }

  const plan = resolveCitizenPlan(planCode);
  if (plan.priceMnt <= 0) {
    throw new ValidationError(CITIZEN_PLAN_PRICE_NOT_CONFIGURED_MESSAGE);
  }

  const existing = (await deps.invoiceRepository.listByUserId(actor.userId)).find(
    (invoice) =>
      invoice.planCode === plan.code &&
      invoice.status === InvoiceStatus.PENDING &&
      invoice.expiresAt.getTime() > now.getTime() &&
      invoice.providerInvoiceId &&
      invoice.qrText,
  );
  if (existing) {
    return toSoloCheckoutView(existing);
  }

  const invoice = await deps.invoiceRepository.create({
    userId: actor.userId,
    planCode: plan.code,
    amountMnt: plan.priceMnt,
    currency: SOLO_INVOICE_CURRENCY,
    provider: BILLING_PROVIDER_QPAY,
    status: InvoiceStatus.PENDING,
    expiresAt: new Date(now.getTime() + SOLO_INVOICE_TTL_MS),
  });

  try {
    const created = await deps.qpayGateway.createInvoice({
      senderInvoiceNo: invoice.id,
      amountMnt: plan.priceMnt,
      description: `${plan.name} — 1 month`,
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

function resolveCitizenPlan(planCode: string): SubscriptionPlanDefinition {
  if (
    planCode !== SubscriptionPlanCode.CITIZEN_BASIC &&
    planCode !== SubscriptionPlanCode.CITIZEN_PLUS
  ) {
    throw new ValidationError("Unsupported citizen plan.");
  }
  return getPlanDefinition(planCode);
}
