import { NextResponse } from "next/server";

import { lawyerEntitlementDeps } from "@/application/common/lawyer-session-http";
import { requireActor } from "@/application/common/require-actor";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { revokeOwnDeviceSession } from "@/application/use-cases/sessions/manage-device-sessions";
import { UserRole } from "@/domain/enums";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const { sessionId } = await context.params;
    await revokeOwnDeviceSession(actor, sessionId, lawyerEntitlementDeps());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionApiErrorResponse(error);
  }
}
