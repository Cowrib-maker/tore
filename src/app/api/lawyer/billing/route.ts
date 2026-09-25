import { NextResponse } from "next/server";

import {
  lawyerEntitlementDeps,
  persistDeviceSessionCookie,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import { requireActor } from "@/application/common/require-actor";
import {
  toBillingCenterPendingInvoice,
  toBillingHistoryRow,
} from "@/application/use-cases/billing/billing-center-view";
import {
  getLawyerBillingSnapshot,
  sharingWarningForState,
} from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { UserRole } from "@/domain/enums";
import { manualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    const deps = lawyerEntitlementDeps();
    const snapshot = await getLawyerBillingSnapshot(actor, ctx, deps);
    await persistDeviceSessionCookie(snapshot.currentSessionId);

    const now = new Date();
    const [rawPendingInvoice, history] = await Promise.all([
      deps.invoiceRepository.findLatestPendingForUser(actor.userId, now),
      deps.invoiceRepository.listByUserId(actor.userId),
    ]);
    const config = manualPaymentConfig();

    return NextResponse.json({
      planCode: snapshot.entitlement?.planCode ?? "SOLO",
      planName: snapshot.planName,
      priceMnt: snapshot.priceMnt,
      seatLimit: snapshot.seatLimit,
      billingRequired: snapshot.billingRequired,
      subscriptionStatus: snapshot.subscriptionStatus,
      expiresAt: snapshot.expiresAt?.toISOString() ?? null,
      pendingInvoice: rawPendingInvoice
        ? toBillingCenterPendingInvoice(rawPendingInvoice, config)
        : null,
      history: history.map(toBillingHistoryRow),
      usage: snapshot.usage,
      riskState: snapshot.risk.state,
      warning: sharingWarningForState(snapshot.risk.state),
      sessions: snapshot.sessions.map((session) => ({
        ...session,
        lastSeenAt: session.lastSeenAt.toISOString(),
        firstSeenAt: session.firstSeenAt.toISOString(),
      })),
      currentSessionId: snapshot.currentSessionId,
    });
  } catch (error) {
    return sessionApiErrorResponse(error);
  }
}
