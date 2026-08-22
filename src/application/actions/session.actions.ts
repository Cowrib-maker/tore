"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import {
  lawyerEntitlementDeps,
  persistDeviceSessionCookie,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { loadSessionProtectionPolicy } from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import {
  revokeOtherDeviceSessions,
  revokeOwnDeviceSession,
} from "@/application/use-cases/sessions/manage-device-sessions";
import { touchDeviceSession } from "@/application/use-cases/sessions/touch-device-session";
import { UserRole } from "@/domain/enums";

const PROFILE_PATH = "/lawyer/profile";

export async function revokeDeviceSessionAction(
  sessionId: string,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    await revokeOwnDeviceSession(actor, sessionId, lawyerEntitlementDeps());
    revalidatePath(PROFILE_PATH);
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function revokeOtherDeviceSessionsAction(): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    await revokeOtherDeviceSessions(
      actor,
      ctx.sessionIdFromCookie,
      lawyerEntitlementDeps(),
    );
    revalidatePath(PROFILE_PATH);
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function touchLawyerDeviceSessionAction(): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const ctx = await readLawyerSessionHttpContext();
    const deps = lawyerEntitlementDeps();
    const policy = await loadSessionProtectionPolicy(
      deps.platformSettingRepository,
    );
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
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
