import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { AdminPaymentRepository } from "@/domain/repositories/admin-payment-repository";
import { qpayEnvironmentLabel } from "@/domain/services/qpay-diagnostics";

export type AdminQpayDiagnostics = {
  environment: "SANDBOX" | "PRODUCTION";
  configured: boolean;
  lastInvoiceCreatedAt: Date | null;
  lastPaymentPaidAt: Date | null;
  paidInvoiceCount: number;
  failedInvoiceCount: number;
  pendingInvoiceCount: number;
};

export type GetAdminQpayDiagnosticsDeps = {
  adminPaymentRepository: AdminPaymentRepository;
  /** Never the raw client_id/client_secret — only whether they're set. */
  isQpayConfigured: () => boolean;
  qpayBaseUrl: string;
};

/**
 * Safe QPay diagnostics: metadata derived from real DB state and the
 * configured base URL only. Never reads client_secret / access_token /
 * refresh_token / Authorization headers — those never leave the QPay
 * gateway/config modules.
 */
export async function getAdminQpayDiagnosticsUseCase(
  actor: ActorContext,
  deps: GetAdminQpayDiagnosticsDeps,
  now: Date = new Date(),
): Promise<AdminQpayDiagnostics> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const summary = await deps.adminPaymentRepository.getQpayActivitySummary(now);

  return {
    environment: qpayEnvironmentLabel(deps.qpayBaseUrl),
    configured: deps.isQpayConfigured(),
    lastInvoiceCreatedAt: summary.lastInvoiceCreatedAt,
    lastPaymentPaidAt: summary.lastPaymentPaidAt,
    paidInvoiceCount: summary.paidInvoiceCount,
    failedInvoiceCount: summary.failedInvoiceCount,
    pendingInvoiceCount: summary.pendingInvoiceCount,
  };
}
