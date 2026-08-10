import { UserStatus } from "@/domain/enums";
import { auth, signOut } from "@/lib/auth";

/**
 * Active session user, or null.
 * Signs out non-ACTIVE sessions so stale cookies cannot act.
 */
export async function getSessionUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    await signOut({ redirect: false });
    return null;
  }

  return session;
}
