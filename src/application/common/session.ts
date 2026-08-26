import { cache } from "react";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { UserStatus } from "@/domain/enums";
import { sessionReplacedLoginPath } from "@/domain/services/active-session";
import { auth, signOut } from "@/lib/auth";

export type AuthSessionLookup = {
  session: Session | null;
  replaced: boolean;
};

/**
 * Active session user, or null.
 * Cached per React request so layout + page + loaders share one auth() call.
 * Stale/replaced JWTs are signed out so Edge middleware cannot bounce /login.
 */
export const lookupAuthSession = cache(async (): Promise<AuthSessionLookup> => {
  const session = await auth();

  if (session?.sessionReplaced) {
    try {
      await signOut({ redirect: false });
    } catch {
      // Cookie clear is best-effort; the JWT is already unusable in Node.
    }
    return { session: null, replaced: true };
  }

  if (!session?.user?.id) {
    return { session: null, replaced: false };
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    return { session: null, replaced: false };
  }

  return { session, replaced: false };
});

export const getSessionUser = cache(async () => {
  const { session } = await lookupAuthSession();
  return session;
});

export async function requirePageSession(): Promise<
  NonNullable<AuthSessionLookup["session"]>
> {
  const { session, replaced } = await lookupAuthSession();
  if (!session?.user?.id) {
    redirect(replaced ? sessionReplacedLoginPath() : "/login");
  }
  return session;
}
