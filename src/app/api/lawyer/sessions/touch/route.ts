import { NextResponse } from "next/server";

import {
  lawyerEntitlementDeps,
  persistDeviceSessionCookie,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import { requireActor } from "@/application/common/require-actor";
import { loadSessionProtectionPolicy } from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { touchDeviceSession } from "@/application/use-cases/sessions/touch-device-session";
import { UserRole } from "@/domain/enums";

export async function POST() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    const deps = lawyerEntitlementDeps();
    const policy = await loadSessionProtectionPolicy(deps.platformSettingRepository);
    const session = await touchDeviceSession(
      {
        userId: actor.userId,
        subscriptionId: null,
        sessionIdFromCookie: ctx.sessionIdFromCookie,
        userAgent: ctx.userAgent,
        ipHash: ctx.ipHash,
        policy,
      },
      deps,
    );
    await persistDeviceSessionCookie(session.id);
    return NextResponse.json({ ok: true, sessionId: session.id });
  } catch (error) {
    return sessionApiErrorResponse(error);
  }
}
