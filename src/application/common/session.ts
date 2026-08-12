import { cache } from "react";

import { UserStatus } from "@/domain/enums";
import { auth } from "@/lib/auth";

/**
 * Active session user, or null.
 * Cached per React request so layout + page + loaders share one auth() call.
 */
export const getSessionUser = cache(async () => {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    return null;
  }

  return session;
});