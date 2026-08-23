import type { Invoice } from "@/domain/entities/invoice";
import type { Subscription } from "@/domain/entities/subscription";
import {
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  PaymentTransactionStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { BillingRepositories, BillingUnitOfWork } from "@/domain/ports/billing-unit-of-work";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import {
  DuplicatePaymentError,
  type InvoiceRepository,
  type PaymentTransactionRepository,
} from "@/domain/repositories/invoice-repository";
import {
  DuplicateActiveSoloError,
  type SubscriptionRepository,
} from "@/domain/repositories/subscription-repository";
import {
  getPlanDefinition,
  getPricedPlanDefinition,
} from "@/domain/constants/subscription-plans";
import { decideSoloSubscriptionPeriod } from "@/domain/services/subscription-period";
import { verifyQpayCatalogPayment } from "@/domain/services/qpay-payment-verification";

export type ProcessQpayPaymentDeps = {
  qpayGateway: QpayGateway;
  invoiceRepository: InvoiceRepository;
  paymentTransactionRepository: PaymentTransactionRepository;
  subscriptionRepository: SubscriptionRepository;
  billingUnitOfWork: BillingUnitOfWork;
};

export type ProcessQpayPaymentResult = {
  alreadyProcessed: boolean;
  invoice: Invoice;
  subscription: Subscription | null;
};

export async function processQpayInvoicePayment(
  providerInvoiceId: string,
  deps: ProcessQpayPaymentDeps,
  now: Date = new Date(),
): Promise<ProcessQpayPaymentResult> {
  const trimmed = providerInvoiceId.trim();
  if (!trimmed) {
    throw new PaymentVerificationError("Invoice was not found", "WRONG_INVOICE");
  }

  const invoice = await deps.invoiceRepository.findByProviderInvoiceId(trimmed);
  if (!invoice?.providerInvoiceId) {
    throw new PaymentVerificationError("Invoice was not found", "WRONG_INVOICE");
  }

  const plan = getPricedPlanDefinition(invoice.planCode);
  if (!plan) {
    await deps.invoiceRepository
      .updateStatus(invoice.id, InvoiceStatus.FAILED)
      .catch(() => undefined);
    throw new PaymentVerificationError(
      "Plan is not priced for payment",
      "UNPRICED_PLAN",
    );
  }

  const checked = await deps.qpayGateway.checkPayment(invoice.providerInvoiceId);
  let verified;
  try {
    verified = verifyQpayCatalogPayment({
      expectedProviderInvoiceId: invoice.providerInvoiceId,
      expectedAmountMnt: plan.priceMnt,
      checked,
    });
  } catch (error) {
    if (
      error instanceof PaymentVerificationError &&
      (error.code === "WRONG_AMOUNT" || error.code === "UNPRICED_PLAN")
    ) {
      await deps.invoiceRepository
        .updateStatus(invoice.id, InvoiceStatus.FAILED)
        .catch(() => undefined);
    }
    throw error;
  }

  return deps.billingUnitOfWork.runInTransaction(async (repos) => {
    const current = await repos.invoiceRepository.findById(invoice.id);
    if (!current) {
      throw new PaymentVerificationError(
        "Invoice was not found",
        "WRONG_INVOICE",
      );
    }

    const existingPayment =
      await repos.paymentTransactionRepository.findByInvoiceId(current.id);
    if (
      current.status === InvoiceStatus.PAID &&
      existingPayment?.status === PaymentTransactionStatus.PAID
    ) {
      return alreadyProcessedResult(current, repos.subscriptionRepository);
    }

    try {
      await repos.paymentTransactionRepository.create({
        invoiceId: current.id,
        provider: BILLING_PROVIDER_QPAY,
        providerPaymentId: verified.paymentId,
        amountMnt: verified.amountMnt,
        currency: verified.currency,
        status: PaymentTransactionStatus.PAID,
        paidAt: now,
        metadata: verified.safeMetadata,
      });
    } catch (error) {
      if (error instanceof DuplicatePaymentError) {
        const paid = await repos.invoiceRepository.findById(current.id);
        return alreadyProcessedResult(
          paid ?? current,
          repos.subscriptionRepository,
        );
      }
      throw error;
    }

    const paidInvoice = await repos.invoiceRepository.updateStatus(
      current.id,
      InvoiceStatus.PAID,
    );
    const subscription = await activateOrRenewPaidSubscription({
      userId: current.userId,
      planCode: current.planCode,
      providerInvoiceId: current.providerInvoiceId!,
      now,
      repos,
    });
    const linked = await repos.invoiceRepository.linkSubscription(
      paidInvoice.id,
      subscription.id,
    );
    return {
      alreadyProcessed: false,
      invoice: linked,
      subscription,
    };
  });
}

async function alreadyProcessedResult(
  invoice: Invoice,
  subscriptionRepository: SubscriptionRepository,
): Promise<ProcessQpayPaymentResult> {
  const subscription = invoice.subscriptionId
    ? await subscriptionRepository.findById(invoice.subscriptionId)
    : await subscriptionRepository.findLatestOwnedByUserId(
        invoice.userId,
        invoice.planCode,
      );
  return { alreadyProcessed: true, invoice, subscription };
}

async function activateOrRenewPaidSubscription(input: {
  userId: string;
  planCode: SubscriptionPlanCode;
  providerInvoiceId: string;
  now: Date;
  repos: BillingRepositories;
}): Promise<Subscription> {
  const plan = getPlanDefinition(input.planCode);
  const existing =
    await input.repos.subscriptionRepository.findLatestOwnedByUserId(
      input.userId,
      input.planCode,
    );
  const decision = decideSoloSubscriptionPeriod({
    now: input.now,
    existing,
  });

  if (!existing) {
    try {
      const created = await input.repos.subscriptionRepository.create({
        ownerUserId: input.userId,
        planCode: plan.code,
        status: SubscriptionStatus.ACTIVE,
        seatLimit: plan.seatLimit,
        currentPeriodStart: decision.startsAt,
        currentPeriodEnd: decision.expiresAt,
        providerInvoiceId: input.providerInvoiceId,
      });
      await input.repos.subscriptionRepository.createSeat({
        subscriptionId: created.id,
        userId: input.userId,
        status: SeatStatus.ACTIVE,
      });
      return created;
    } catch (error) {
      if (error instanceof DuplicateActiveSoloError) {
        const raced =
          await input.repos.subscriptionRepository.findLatestOwnedByUserId(
            input.userId,
            input.planCode,
          );
        if (raced) {
          return applyPeriod(raced, input);
        }
      }
      throw error;
    }
  }

  return applyPeriod(existing, input);
}

async function applyPeriod(
  existing: Subscription,
  input: {
    now: Date;
    providerInvoiceId: string;
    repos: BillingRepositories;
  },
): Promise<Subscription> {
  const decision = decideSoloSubscriptionPeriod({
    now: input.now,
    existing,
  });
  const updated = await input.repos.subscriptionRepository.updatePeriod(
    existing.id,
    {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: decision.startsAt,
      currentPeriodEnd: decision.expiresAt,
      providerInvoiceId: input.providerInvoiceId,
    },
  );
  const seats = await input.repos.subscriptionRepository.listSeats(updated.id);
  const hasSeat = seats.some(
    (seat) =>
      seat.userId === existing.ownerUserId && seat.status === SeatStatus.ACTIVE,
  );
  if (!hasSeat) {
    await input.repos.subscriptionRepository.createSeat({
      subscriptionId: updated.id,
      userId: existing.ownerUserId,
      status: SeatStatus.ACTIVE,
    });
  }
  return updated;
}
