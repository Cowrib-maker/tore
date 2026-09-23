import { UserRole } from "@/domain/enums";

/** Citizen-facing chat lives on the public homepage. */
export const TORE_CHAT_HREF = "/#chat";

/** Student academy — theory, method, tests, and problem exams. */
export const TORE_STUDENT_HREF = "/student";

export const LAWYER_WORKSPACE_PATH = "/lawyer/workspace";

/** Firm/Team both create or manage an Organization — same feature, two audiences. */
export const TORE_ORGANIZATIONS_HREF = "/organizations";

export type HomepageVisitorRole = UserRole | null | undefined;

/**
 * Public `/` is always the citizen TORE Chat homepage.
 * Product destinations below are used by homepage CTAs — not login/auth.
 */
export function getPublicHomepageDestination(
  role: HomepageVisitorRole,
): string {
  if (role === UserRole.LAWYER) {
    return LAWYER_WORKSPACE_PATH;
  }
  return "/";
}

export function getHomepageAccountHref(role: HomepageVisitorRole): string {
  if (role === UserRole.LAWYER) {
    return LAWYER_WORKSPACE_PATH;
  }
  if (role === UserRole.ADMIN) {
    return "/admin/dashboard";
  }
  if (role === UserRole.CLIENT) {
    return TORE_CHAT_HREF;
  }
  return "/login";
}

export function getHomepageProductHref(
  product: "citizen" | "student" | "lawyer" | "firm" | "team",
  role: HomepageVisitorRole,
): string {
  if (product === "citizen") {
    return TORE_CHAT_HREF;
  }
  if (product === "student") {
    return TORE_STUDENT_HREF;
  }
  if (product === "firm" || product === "team") {
    return TORE_ORGANIZATIONS_HREF;
  }
  if (role === UserRole.LAWYER) {
    return LAWYER_WORKSPACE_PATH;
  }
  return "/register/lawyer";
}
