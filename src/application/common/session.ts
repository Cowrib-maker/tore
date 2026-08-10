import { cache } from "react";

import { UserStatus } from "@/domain/enums";
import { auth, signOut } from "@/lib/auth";

/**
 * Active session user, or null.
 * Signs out non-ACTIVE sessions so stale cookies cannot act.
 * Cached per React request so layout + page + loaders share one auth() call.
 */
export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    await signOut({ redirect: false });
    return null;
  }

  return session;
});
