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
import {
  DuplicatePaymentCodeError,
  type InvoiceRepository,
} from "@/domain/repositories/invoice-repository";
import { generateManualPaymentCode } from "@/domain/services/manual-payment-code";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";
import type { ManualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";

/**
 * Collisions are only possible among invoices simultaneously PENDING/
 * AWAITING_VERIFICATION out of a 4-digit (10,000-value) space — vanishingly
 * unlikely at this volume, and the database's partial unique index makes
 * every attempt here safe under real concurrency, not just single-process
 * testing (see the migration adding `payment_code`).
 */
const MAX_PAYMENT_CODE_ATTEMPTS = 10;

export type ManualCheckoutMethod = "BANK_TRANSFER" | "QR";

export type ManualCheckoutView = {
  invoiceId: string;
  planCode: string;
  amountMnt: number;
  currency: string;
  status: InvoiceStatus;
  expiresAt: string;
  /**
   * The "Гүйлгээний утга" the user must enter — the 4-digit paymentCode
   * for any invoice created after this feature shipped; falls back to the
   * older TORE-xxxxxxxx provider reference only for invoices created
   * before it (which never got a paymentCode).
   */
  reference: string;
  /** The raw 4-digit code, null only for pre-existing invoices without one. */
  paymentCode: string | null;
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
    reference:
      invoice.paymentCode ??
      invoice.providerInvoiceId ??
      manualPaymentReference(invoice.id),
    paymentCode: invoice.paymentCode,
    method,
    // Shown for both manual methods now — a customer paying via QR can
    // also confirm/enter the destination account directly in their
    // banking app, exactly like a BANK_TRANSFER customer does.
    bankName: config.bankName,
    bankAccountNumber: config.bankAccountNumber,
    bankAccountName: config.bankAccountName,
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

  let invoice: Invoice | undefined;
  for (let attempt = 0; attempt < MAX_PAYMENT_CODE_ATTEMPTS; attempt++) {
    try {
      invoice = await deps.invoiceRepository.create({
        userId,
        planCode: plan.code,
        amountMnt: plan.priceMnt,
        currency: SOLO_INVOICE_CURRENCY,
        provider,
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(now.getTime() + SOLO_INVOICE_TTL_MS),
        paymentCode: generateManualPaymentCode(),
      });
      break;
    } catch (error) {
      if (error instanceof DuplicatePaymentCodeError) {
        if (attempt < MAX_PAYMENT_CODE_ATTEMPTS - 1) {
          continue;
        }
        break;
      }
      throw error;
    }
  }
  if (!invoice) {
    throw new ValidationError("Could not allocate a unique payment code. Please try again.");
  }
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
