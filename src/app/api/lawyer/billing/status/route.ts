import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { getLawyerPlanStatus } from "@/application/use-cases/entitlements/get-lawyer-plan-status";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { UserRole } from "@/domain/enums";
import {
  invoiceRepository,
  subscriptionRepository,
} from "@/infrastructure/repositories";

/**
 * Read-only plan status for the lawyer workspace sidebar, polled on navigation.
 * Deliberately separate from GET /api/lawyer/billing: that snapshot touches the
 * device session (a write plus a Set-Cookie) and feeds the account-sharing
 * velocity counter, which a navigation poll must not do. Nothing here reads the
 * device-session cookie, writes a row or sets a cookie.
 */
export async function GET() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const status = await getLawyerPlanStatus(actor, {
      subscriptionRepository,
      invoiceRepository,
    });
    return NextResponse.json(
      {
        planName: status.planName,
        billingRequired: status.billingRequired,
        subscriptionStatus: status.subscriptionStatus,
        expiresAt: status.expiresAt?.toISOString() ?? null,
        pendingInvoice: status.pendingInvoice,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return sessionApiErrorResponse(error);
  }
}
