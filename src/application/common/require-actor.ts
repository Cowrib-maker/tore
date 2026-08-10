import { getSessionUser } from "@/application/common/session";
import type { ActorContext } from "@/application/common/actor-context";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import type { UserRole } from "@/domain/enums";

/** Require an authenticated ACTIVE session; optional role match. */
export async function requireActor(role?: UserRole): Promise<ActorContext> {
  const session = await getSessionUser();
  if (!session?.user?.id) {
    throw new UnauthorizedError("You must be signed in");
  }

  const userRole = session.user.role as UserRole;
  if (role !== undefined && userRole !== role) {
    throw new ForbiddenError();
  }

  return { userId: session.user.id, role: userRole };
}
