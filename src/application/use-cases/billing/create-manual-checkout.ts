import type { ActorContext } from "@/application/common/actor-context";
import { assertLawyerEntitlementActor } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { SOLO_INVOICE_TTL_MS } from "@/application/use-cases/billing/checkout-view";
import {
  CITIZEN_PLAN_PRICE_NOT_CONFIGURED_MESSAGE,
} from "@/application/common/public-service-errors";
import {
  SOLO_PLAN,
  getPlanDefinition,
  type SubscriptionPlanDefinition,
} from "@/domain/constants/subscription-plans";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
  InvoiceStatus,
  SubscriptionPlanCode,
  UserRole,
  type ManualBillingProvider,
} from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { Invoice } from "@/domain/entities/invoice";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";
import type { ManualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";

export type ManualCheckoutMethod = "BANK_TRANSFER" | "QR";

export type ManualCheckoutView = {
  invoiceId: string;
  planCode: string;
  amountMnt: number;
  currency: string;
  status: InvoiceStatus;
  expiresAt: string;
  /** The "Гүйлгээний утга" the user must enter — also stored as this invoice's providerInvoiceId. */
  reference: string;
  method: ManualCheckoutMethod;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  qrAssetUrl: string | null;
};

export type CreateManualCheckoutDeps = {
  invoiceRepository: InvoiceRepository;
  manualPaymentConfig: ManualPaymentConfig;
};

const ACTIVE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.PENDING,
  InvoiceStatus.AWAITING_VERIFICATION,
]);

function providerFor(method: ManualCheckoutMethod): ManualBillingProvider {
  return method === "BANK_TRANSFER"
    ? BILLING_PROVIDER_MANUAL_BANK_TRANSFER
    : BILLING_PROVIDER_MANUAL_QR;
}

/** Deterministic from the invoice's own id — never random, so the same invoice always displays the same reference on re-render. */
function manualPaymentReference(invoiceId: string): string {
  return `TORE-${invoiceId.slice(-8).toUpperCase()}`;
}

function toManualCheckoutView(
  invoice: Invoice,
  method: ManualCheckoutMethod,
  config: ManualPaymentConfig,
): ManualCheckoutView {
  return {
    invoiceId: invoice.id,
    planCode: invoice.planCode ?? "",
    amountMnt: invoice.amountMnt,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt.toISOString(),
    reference: invoice.providerInvoiceId ?? manualPaymentReference(invoice.id),
    method,
    bankName: method === "BANK_TRANSFER" ? config.bankName : null,
    bankAccountNumber: method === "BANK_TRANSFER" ? config.bankAccountNumber : null,
    bankAccountName: method === "BANK_TRANSFER" ? config.bankAccountName : null,
    qrAssetUrl: method === "QR" ? config.qrAssetUrl : null,
  };
}

async function findReusableInvoice(
  deps: CreateManualCheckoutDeps,
  userId: string,
  plan: SubscriptionPlanDefinition,
  provider: ManualBillingProvider,
  now: Date,
): Promise<Invoice | null> {
  const invoices = await deps.invoiceRepository.listByUserId(userId);
  return (
    invoices.find(
      (invoice) =>
        invoice.planCode === plan.code &&
        invoice.provider === provider &&
        ACTIVE_STATUSES.has(invoice.status) &&
        invoice.expiresAt.getTime() > now.getTime() &&
        !invoice.bookingId,
    ) ?? null
  );
}

async function createManualCheckoutForPlan(
  userId: string,
  plan: SubscriptionPlanDefinition,
  method: ManualCheckoutMethod,
  deps: CreateManualCheckoutDeps,
  now: Date,
): Promise<ManualCheckoutView> {
  if (!deps.manualPaymentConfig.enabled) {
    throw new ValidationError("Manual payment is not currently available.");
  }

  const provider = providerFor(method);
  const reusable = await findReusableInvoice(deps, userId, plan, provider, now);
  if (reusable) {
    return toManualCheckoutView(reusable, method, deps.manualPaymentConfig);
  }

  const invoice = await deps.invoiceRepository.create({
    userId,
    planCode: plan.code,
    amountMnt: plan.priceMnt,
    currency: SOLO_INVOICE_CURRENCY,
    provider,
    status: InvoiceStatus.PENDING,
    expiresAt: new Date(now.getTime() + SOLO_INVOICE_TTL_MS),
  });
  const attached = await deps.invoiceRepository.attachProviderInvoice(invoice.id, {
    providerInvoiceId: manualPaymentReference(invoice.id),
    qrText: null,
    qrImage: null,
    shortUrl: null,
    deeplinks: [],
  });
  return toManualCheckoutView(attached, method, deps.manualPaymentConfig);
}

/** TORE SOLO — lawyer manual checkout (bank transfer or printed QR). */
export async function createManualLawyerCheckout(
  actor: ActorContext,
  method: ManualCheckoutMethod,
  deps: CreateManualCheckoutDeps,
  now: Date = new Date(),
): Promise<ManualCheckoutView> {
  assertLawyerEntitlementActor(actor);
  return createManualCheckoutForPlan(actor.userId, SOLO_PLAN, method, deps, now);
}

/** Citizen plan manual checkout (bank transfer or printed QR). */
export async function createManualCitizenCheckout(
  actor: ActorContext,
  planCode: string,
  method: ManualCheckoutMethod,
  deps: CreateManualCheckoutDeps,
  now: Date = new Date(),
): Promise<ManualCheckoutView> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }
  const plan = resolveCitizenPlan(planCode);
  if (plan.priceMnt <= 0) {
    throw new ValidationError(CITIZEN_PLAN_PRICE_NOT_CONFIGURED_MESSAGE);
  }
  return createManualCheckoutForPlan(actor.userId, plan, method, deps, now);
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
