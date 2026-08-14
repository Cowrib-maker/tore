import { UserType, type IUserTypeService, type UserTypeContext } from "./types";

/**
 * Resolves {@link UserType} from adapter-supplied context.
 *
 * Mapping lives here so HTTP routes never branch on role strings.
 * Precedence: explicit `userType` → enterprise workspace → lawyer role → public.
 */
export class UserTypeService implements IUserTypeService {
  resolve(context: UserTypeContext = {}): UserType {
    if (context.userType) {
      return context.userType;
    }

    if (context.isEnterprise || hasText(context.organizationId)) {
      return UserType.ENTERPRISE;
    }

    const role = context.role?.trim().toUpperCase() ?? "";
    if (ENTERPRISE_ROLES.has(role)) {
      return UserType.ENTERPRISE;
    }
    if (LAWYER_ROLES.has(role)) {
      return UserType.LAWYER;
    }

    return UserType.PUBLIC;
  }
}

const LAWYER_ROLES = new Set(["LAWYER"]);
const ENTERPRISE_ROLES = new Set([
  "ENTERPRISE",
  "ORGANIZATION",
  "ORG",
  "COMPANY",
]);

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
