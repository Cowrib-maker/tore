import { cookies } from "next/headers";

import {
  GUEST_SESSION_COOKIE,
  guestCookieOptions,
  newGuestToken,
  parseGuestCookieValue,
  signGuestCookieValue,
  hashGuestToken,
} from "@/infrastructure/legal-ai/guest-session-cookie";
import {
  claimGuestConversationsForUser,
  createGuestSessionRecord,
  findGuestSessionByTokenHash,
  touchGuestSession,
} from "@/infrastructure/legal-ai/prisma-guest-session-store";

export async function resolveGuestSession(options?: {
  claimForUserId?: string;
  createIfMissing?: boolean;
}): Promise<{ id: string; cookieValue: string; expiresAt: Date } | null> {
  const jar = await cookies();
  const parsed = parseGuestCookieValue(jar.get(GUEST_SESSION_COOKIE)?.value);
  const now = new Date();

  if (parsed) {
    const existing = await findGuestSessionByTokenHash(hashGuestToken(parsed.token));
    if (
      existing &&
      existing.id === parsed.sessionId &&
      existing.expiresAt.getTime() > now.getTime()
    ) {
      await touchGuestSession(existing.id, now);
      if (options?.claimForUserId) {
        await claimGuestConversationsForUser(existing.id, options.claimForUserId);
      }
      return {
        id: existing.id,
        cookieValue: signGuestCookieValue(existing.id, parsed.token),
        expiresAt: existing.expiresAt,
      };
    }
  }

  if (options?.createIfMissing === false) {
    return null;
  }

  const token = newGuestToken();
  const created = await createGuestSessionRecord(token, now);
  const cookieValue = signGuestCookieValue(created.id, token);
  jar.set(GUEST_SESSION_COOKIE, cookieValue, guestCookieOptions(created.expiresAt));
  return { id: created.id, cookieValue, expiresAt: created.expiresAt };
}
