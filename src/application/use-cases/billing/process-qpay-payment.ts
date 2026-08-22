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
import { SOLO_PLAN } from "@/domain/constants/subscription-plans";
import { decideSoloSubscriptionPeriod } from "@/domain/services/subscription-period";
import { verifySoloQpayPayment } from "@/domain/services/qpay-payment-verification";

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

  const checked = await deps.qpayGateway.checkPayment(invoice.providerInvoiceId);
  let verified;
  try {
    verified = verifySoloQpayPayment({
      expectedProviderInvoiceId: invoice.providerInvoiceId,
      checked,
    });
  } catch (error) {
    if (
      error instanceof PaymentVerificationError &&
      error.code === "WRONG_AMOUNT"
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
    const subscription = await activateOrRenewSoloSubscription({
      userId: current.userId,
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
        SubscriptionPlanCode.SOLO,
      );
  return { alreadyProcessed: true, invoice, subscription };
}

async function activateOrRenewSoloSubscription(input: {
  userId: string;
  providerInvoiceId: string;
  now: Date;
  repos: BillingRepositories;
}): Promise<Subscription> {
  const existing =
    await input.repos.subscriptionRepository.findLatestOwnedByUserId(
      input.userId,
      SubscriptionPlanCode.SOLO,
    );
  const decision = decideSoloSubscriptionPeriod({
    now: input.now,
    existing,
  });

  if (!existing) {
    try {
      const created = await input.repos.subscriptionRepository.create({
        ownerUserId: input.userId,
        planCode: SOLO_PLAN.code,
        status: SubscriptionStatus.ACTIVE,
        seatLimit: SOLO_PLAN.seatLimit,
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
            SubscriptionPlanCode.SOLO,
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
