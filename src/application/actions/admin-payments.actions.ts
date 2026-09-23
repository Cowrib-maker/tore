"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { listManualPayments } from "@/application/use-cases/billing/list-manual-payments";
import { rejectManualPayment } from "@/application/use-cases/billing/reject-manual-payment";
import { verifyManualPayment } from "@/application/use-cases/billing/verify-manual-payment";
import { AuditAction, InvoiceStatus, UserRole } from "@/domain/enums";
import { billingUnitOfWork } from "@/infrastructure/database/prisma-billing-unit-of-work";
import { auditLogRepository, invoiceRepository, userRepository } from "@/infrastructure/repositories";
import { ADMIN_PAYMENT_VERIFICATION_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

async function guardPaymentVerification(actor: { userId: string }) {
  return enforceRateLimit(
    `admin:payment-verification:${actor.userId}`,
    ADMIN_PAYMENT_VERIFICATION_RATE_LIMIT,
  );
}

export async function getAdminManualPaymentsList(status: InvoiceStatus = InvoiceStatus.AWAITING_VERIFICATION) {
  const actor = await requireActor(UserRole.ADMIN);
  return listManualPayments(actor, status, { invoiceRepository, userRepository });
}

export async function adminVerifyManualPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardPaymentVerification(actor);
    if (limited) return limited;

    const invoiceId = String(formData.get("invoiceId") ?? "");
    const result = await verifyManualPayment(actor, invoiceId, { billingUnitOfWork });

    await auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.APPROVE,
      entityType: "Invoice",
      entityId: invoiceId,
      metadata: {
        provider: result.invoice.provider,
        amountMnt: result.invoice.amountMnt,
        alreadyProcessed: result.alreadyProcessed,
      },
    });

    revalidatePath("/admin/payments");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminRejectManualPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardPaymentVerification(actor);
    if (limited) return limited;

    const invoiceId = String(formData.get("invoiceId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const invoice = await rejectManualPayment(actor, invoiceId, reason, { invoiceRepository });

    await auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.REJECT,
      entityType: "Invoice",
      entityId: invoiceId,
      metadata: { provider: invoice.provider, reason: invoice.rejectionReason },
    });

    revalidatePath("/admin/payments");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
