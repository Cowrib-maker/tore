import { NextResponse } from "next/server";

import {
  lawyerEntitlementDeps,
  persistDeviceSessionCookie,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import { requireActor } from "@/application/common/require-actor";
import { getLawyerBillingSnapshot } from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { UserRole } from "@/domain/enums";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    const snapshot = await getLawyerBillingSnapshot(actor, ctx, lawyerEntitlementDeps());
    await persistDeviceSessionCookie(snapshot.currentSessionId);
    return NextResponse.json({
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
