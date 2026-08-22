import type { ActorContext } from "@/application/common/actor-context";
import type { DeviceSession } from "@/domain/entities/subscription";
import { DeviceSessionStatus, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
} from "@/domain/errors/domain-error";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import { summarizeUserAgent } from "@/domain/services/user-agent";

export type SessionManagementDeps = {
  deviceSessionRepository: DeviceSessionRepository;
};

export type DeviceSessionView = {
  id: string;
  isCurrent: boolean;
  deviceLabel: string;
  lastSeenAt: Date;
  firstSeenAt: Date;
  status: DeviceSessionStatus;
};

export function assertCanManageOwnSessions(actor: ActorContext): void {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError();
  }
}

function toView(
  session: DeviceSession,
  currentSessionId: string | null,
): DeviceSessionView {
  return {
    id: session.id,
    isCurrent: currentSessionId === session.id,
    deviceLabel: summarizeUserAgent(session.userAgent),
    lastSeenAt: session.lastSeenAt,
    firstSeenAt: session.firstSeenAt,
    status: session.status,
  };
}

export async function listOwnDeviceSessions(
  actor: ActorContext,
  currentSessionId: string | null,
  deps: SessionManagementDeps,
): Promise<DeviceSessionView[]> {
  assertCanManageOwnSessions(actor);
  const sessions = await deps.deviceSessionRepository.listActiveByUserId(
    actor.userId,
  );
  return sessions.map((session) => toView(session, currentSessionId));
}

export async function revokeOwnDeviceSession(
  actor: ActorContext,
  sessionId: string,
  deps: SessionManagementDeps,
  now: Date = new Date(),
): Promise<void> {
  assertCanManageOwnSessions(actor);
  const session = await deps.deviceSessionRepository.findById(sessionId);
  if (!session || session.userId !== actor.userId) {
    throw new NotFoundError("DeviceSession", sessionId);
  }
  if (session.status === DeviceSessionStatus.REVOKED) {
    return;
  }
  await deps.deviceSessionRepository.revoke(session.id, now);
}

export async function revokeOtherDeviceSessions(
  actor: ActorContext,
  currentSessionId: string | null,
  deps: SessionManagementDeps,
  now: Date = new Date(),
): Promise<number> {
  assertCanManageOwnSessions(actor);
  return deps.deviceSessionRepository.revokeAllForUser(
    actor.userId,
    now,
    currentSessionId ?? undefined,
  );
}
