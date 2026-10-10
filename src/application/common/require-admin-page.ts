import { redirect } from "next/navigation";

import type { ActorContext } from "@/application/common/actor-context";
import { requireActor } from "@/application/common/require-actor";
import { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";

/**
 * Page-level admin gate (the /admin layout also checks). Authorization is read from the database through requireActor,
 * never from client state or a query parameter. Anyone who is not an active ADMIN is sent to /login.
 */
export async function requireAdminPage(): Promise<ActorContext> {
  try {
    return await requireActor(UserRole.ADMIN);
  } catch (error) {
    if (error instanceof DomainError) redirect("/login");
    throw error;
  }
}
