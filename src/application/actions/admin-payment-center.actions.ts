"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { mapActionError } from "@/application/common/map-action-error";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { getAdminPaymentDashboardUseCase } from "@/application/use-cases/admin/payments/get-payment-dashboard";
import { getAdminQpayDiagnosticsUseCase } from "@/application/use-cases/admin/payments/get-qpay-diagnostics";
import { getAdminUserPaymentTraceUseCase } from "@/application/use-cases/admin/payments/get-user-payment-trace";
import { listAdminEntitlementsUseCase } from "@/application/use-cases/admin/payments/list-entitlements";
import { listAdminInvoicesUseCase } from "@/application/use-cases/admin/payments/list-invoices";
import { listAdminPaymentTransactionsUseCase } from "@/application/use-cases/admin/payments/list-payment-transactions";
import { listAdminSubscriptionsUseCase } from "@/application/use-cases/admin/payments/list-subscriptions";
import { verifyAdminQpayInvoiceUseCase } from "@/application/use-cases/admin/payments/verify-qpay-invoice";
import { isQpayConfigured } from "@/infrastructure/billing/create-qpay-gateway";
import { env } from "@/lib/env";
import {
  AuditAction,
  type InvoiceStatus,
  type PaymentTransactionStatus,
  type SubscriptionPlanCode,
  type SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import {
  adminPaymentRepository,
  auditLogRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { ADMIN_PAYMENT_VERIFICATION_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

export async function getAdminPaymentDashboard() {
  const actor = await requireActor(UserRole.ADMIN);
  return getAdminPaymentDashboardUseCase(actor, { adminPaymentRepository });
}

export async function getAdminInvoices(input: {
  status?: InvoiceStatus;
  planCode?: SubscriptionPlanCode;
  provider?: string;
  userSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  return listAdminInvoicesUseCase(actor, input, { adminPaymentRepository });
}

export async function getAdminPaymentTransactions(input: {
  status?: PaymentTransactionStatus;
  provider?: string;
  userSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  return listAdminPaymentTransactionsUseCase(actor, input, { adminPaymentRepository });
}

export async function getAdminSubscriptions(input: {
  status?: SubscriptionStatus;
  planCode?: SubscriptionPlanCode;
  userSearch?: string;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  return listAdminSubscriptionsUseCase(actor, input, { adminPaymentRepository });
}

export async function getAdminEntitlements(input: {
  userSearch?: string;
  activeOnly?: boolean;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  return listAdminEntitlementsUseCase(actor, input, { adminPaymentRepository });
}

export async function getAdminUserPaymentTrace(identifier: string) {
  const actor = await requireActor(UserRole.ADMIN);
  return getAdminUserPaymentTraceUseCase(actor, identifier, {
    adminPaymentRepository,
    userRepository,
  });
}

export async function getAdminQpayDiagnostics() {
  const actor = await requireActor(UserRole.ADMIN);
  return getAdminQpayDiagnosticsUseCase(actor, {
    adminPaymentRepository,
    isQpayConfigured,
    qpayBaseUrl: env.QPAY_BASE_URL,
  });
}

async function guardQpayVerification(actor: { userId: string }) {
  return enforceRateLimit(
    `admin:qpay-verification:${actor.userId}`,
    ADMIN_PAYMENT_VERIFICATION_RATE_LIMIT,
  );
}

/**
 * "QPay-р шалгах" — admin re-runs the real QPay payment/check for one
 * invoice (never a manual "mark as paid"). Uses the exact same
 * verification path as the QPay callback route.
 */
export async function adminVerifyQpayInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardQpayVerification(actor);
    if (limited) return limited;

    const invoiceId = String(formData.get("invoiceId") ?? "");
    const result = await verifyAdminQpayInvoiceUseCase(
      actor,
      invoiceId,
      lawyerBillingDeps(),
    );

    await auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.APPROVE,
      entityType: "Invoice",
      entityId: invoiceId,
      metadata: {
        trigger: "admin-qpay-verify",
        provider: result.invoice.provider,
        status: result.invoice.status,
        alreadyProcessed: result.alreadyProcessed,
      },
    });

    revalidatePath("/admin/payments/invoices");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
