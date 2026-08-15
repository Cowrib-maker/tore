import { describe, expect, it } from "vitest";

import { UserRole } from "@/domain/enums";
import {
  canAccessRoute,
  isProtectedAppRoute,
  isSharedAuthenticatedRoute,
  matchesRoutePrefix,
} from "@/domain/services/rbac";

describe("protected app route boundaries", () => {
  it("does not treat public /lawyers as the lawyer app shell", () => {
    expect(matchesRoutePrefix("/lawyers", "/lawyer")).toBe(false);
    expect(matchesRoutePrefix("/lawyer", "/lawyer")).toBe(true);
    expect(matchesRoutePrefix("/lawyer/dashboard", "/lawyer")).toBe(true);

    expect(isProtectedAppRoute("/lawyers")).toBe(false);
    expect(isProtectedAppRoute("/lawyers/bat-erdene")).toBe(false);
    expect(isProtectedAppRoute("/lawyer")).toBe(true);
    expect(isProtectedAppRoute("/lawyer/dashboard")).toBe(true);
    expect(isProtectedAppRoute("/legal-ai")).toBe(false);
  });

  it("treats /organizations as a shared authenticated surface", () => {
    expect(isSharedAuthenticatedRoute("/organizations")).toBe(true);
    expect(isSharedAuthenticatedRoute("/organizations/new")).toBe(true);
    expect(isSharedAuthenticatedRoute("/organizations/org_1")).toBe(true);
    expect(isProtectedAppRoute("/organizations")).toBe(true);

    expect(canAccessRoute(UserRole.CLIENT, "/organizations")).toBe(true);
    expect(canAccessRoute(UserRole.LAWYER, "/organizations/new")).toBe(true);
    expect(canAccessRoute(UserRole.ADMIN, "/organizations/org_1")).toBe(true);

    expect(canAccessRoute(UserRole.CLIENT, "/lawyer/dashboard")).toBe(false);
  });
});
