import type { DeviceSession } from "@/domain/entities/subscription";
import { DeviceSessionStatus } from "@/domain/enums";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import type { SessionProtectionPolicy } from "@/domain/constants/session-protection-policy";
import { truncateUserAgent } from "@/domain/services/user-agent";

export type TouchDeviceSessionDeps = {
  deviceSessionRepository: DeviceSessionRepository;
};

export type TouchDeviceSessionInput = {
  userId: string;
  subscriptionId: string | null;
  sessionIdFromCookie?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  now?: Date;
  policy: SessionProtectionPolicy;
};

function nextRequestWindow(
  session: DeviceSession | null,
  now: Date,
  windowSeconds: number,
): { requestCountWindowStart: Date; requestCountInWindow: number } {
  const windowMs = windowSeconds * 1000;
  if (
    session?.requestCountWindowStart &&
    now.getTime() - session.requestCountWindowStart.getTime() < windowMs
  ) {
    return {
      requestCountWindowStart: session.requestCountWindowStart,
      requestCountInWindow: session.requestCountInWindow + 1,
    };
  }
  return { requestCountWindowStart: now, requestCountInWindow: 1 };
}

/**
 * Create or refresh a server-side device session.
 * A revoked cookie is not auto-replaced — the user must sign in again
 * for expensive lawyer operations on that device.
 */
export async function touchDeviceSession(
  input: TouchDeviceSessionInput,
  deps: TouchDeviceSessionDeps,
): Promise<DeviceSession> {
  const now = input.now ?? new Date();
  const userAgent = truncateUserAgent(input.userAgent);
  const cookieId = input.sessionIdFromCookie?.trim() || null;

  if (cookieId) {
    const existing = await deps.deviceSessionRepository.findById(cookieId);
    if (existing && existing.userId === input.userId) {
      if (
        existing.status === DeviceSessionStatus.REVOKED ||
        existing.revokedAt
      ) {
        throw new UnauthorizedError("This session is no longer active.");
      }
      const window = nextRequestWindow(
        existing,
        now,
        input.policy.velocityWindowSeconds,
      );
      return deps.deviceSessionRepository.touch(existing.id, {
        lastSeenAt: now,
        userAgent,
        ipHash: input.ipHash ?? existing.ipHash,
        subscriptionId: input.subscriptionId,
        requestCountWindowStart: window.requestCountWindowStart,
        requestCountInWindow: window.requestCountInWindow,
      });
    }
  }

  const window = nextRequestWindow(null, now, input.policy.velocityWindowSeconds);
  return deps.deviceSessionRepository.create({
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    userAgent,
    ipHash: input.ipHash,
    firstSeenAt: now,
    lastSeenAt: now,
    requestCountWindowStart: window.requestCountWindowStart,
    requestCountInWindow: window.requestCountInWindow,
  });
}
