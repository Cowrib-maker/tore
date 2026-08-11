import { OrganizationType, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

/**
 * Sprint 2.3 locked create authorization matrix (blueprint § Create authorization).
 */
export function assertOrganizationCreateAuthorization(
  actorRole: UserRole,
  type: OrganizationType,
): void {
  if (actorRole === UserRole.ADMIN) {
    return;
  }
  if (actorRole === UserRole.LAWYER && type === OrganizationType.LAW_FIRM) {
    return;
  }
  if (
    actorRole === UserRole.CLIENT &&
    type === OrganizationType.LEGAL_ENTITY
  ) {
    return;
  }
  throw new ForbiddenError(
    "Actor is not permitted to create this organization type",
  );
}

export function resolveOrganizationFoundingOwnerUserId(input: {
  actorUserId: string;
  actorRole: UserRole;
  foundingOwnerUserId?: string;
}): string {
  if (
    input.foundingOwnerUserId == null ||
    input.foundingOwnerUserId === ""
  ) {
    return input.actorUserId;
  }
  if (input.actorRole !== UserRole.ADMIN) {
    throw new ForbiddenError(
      "Only platform ADMIN may designate a founding owner other than self",
    );
  }
  return input.foundingOwnerUserId;
}
