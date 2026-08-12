import { OrganizationType, UserRole } from "@/domain/enums";

/** Allowed create types for the current actor (create-authz matrix). */
export function creatableOrganizationTypesForRole(
  role: UserRole,
): OrganizationType[] {
  if (role === UserRole.ADMIN) {
    return [OrganizationType.LAW_FIRM, OrganizationType.LEGAL_ENTITY];
  }
  if (role === UserRole.LAWYER) {
    return [OrganizationType.LAW_FIRM];
  }
  if (role === UserRole.CLIENT) {
    return [OrganizationType.LEGAL_ENTITY];
  }
  return [];
}
