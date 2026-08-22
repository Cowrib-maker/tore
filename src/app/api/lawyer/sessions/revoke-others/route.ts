import { NextResponse } from "next/server";

import {
  lawyerEntitlementDeps,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import { requireActor } from "@/application/common/require-actor";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { revokeOtherDeviceSessions } from "@/application/use-cases/sessions/manage-device-sessions";
import { UserRole } from "@/domain/enums";

export async function POST() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    const revoked = await revokeOtherDeviceSessions(
      actor,
      ctx.sessionIdFromCookie,
      lawyerEntitlementDeps(),
    );
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    return sessionApiErrorResponse(error);
  }
}
