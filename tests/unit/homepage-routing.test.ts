import { describe, expect, it } from "vitest";

import { UserRole } from "@/domain/enums";
import {
  getHomepageAccountHref,
  getHomepageProductHref,
  getPublicHomepageDestination,
  LAWYER_WORKSPACE_PATH,
  TORE_CHAT_HREF,
  TORE_ORGANIZATIONS_HREF,
  TORE_STUDENT_HREF,
} from "@/domain/services/homepage-routing";

describe("public homepage role routing", () => {
  it("keeps guests and citizens on TORE Chat", () => {
    expect(getPublicHomepageDestination(null)).toBe("/");
    expect(getPublicHomepageDestination(undefined)).toBe("/");
    expect(getPublicHomepageDestination(UserRole.CLIENT)).toBe("/");
    expect(getPublicHomepageDestination(UserRole.ADMIN)).toBe("/");
    expect(getHomepageProductHref("citizen", UserRole.CLIENT)).toBe(TORE_CHAT_HREF);
    expect(getHomepageAccountHref(UserRole.CLIENT)).toBe(TORE_CHAT_HREF);
  });

  it("maps lawyers to the workspace product destination", () => {
    expect(getPublicHomepageDestination(UserRole.LAWYER)).toBe(
      LAWYER_WORKSPACE_PATH,
    );
    expect(getHomepageAccountHref(UserRole.LAWYER)).toBe(LAWYER_WORKSPACE_PATH);
    expect(getHomepageProductHref("lawyer", UserRole.LAWYER)).toBe(
      LAWYER_WORKSPACE_PATH,
    );
  });

  it("routes the student product to the academy hub", () => {
    expect(TORE_STUDENT_HREF).toBe("/student");
    expect(getHomepageProductHref("student", null)).toBe(TORE_STUDENT_HREF);
    expect(getHomepageProductHref("student", UserRole.CLIENT)).toBe(
      TORE_STUDENT_HREF,
    );
  });

  it("does not send non-lawyers into the lawyer workspace", () => {
    expect(getHomepageProductHref("lawyer", null)).toBe("/register/lawyer");
    expect(getHomepageProductHref("lawyer", UserRole.CLIENT)).toBe(
      "/register/lawyer",
    );
  });

  it("routes firm and team products to the organizations feature", () => {
    expect(getHomepageProductHref("firm", null)).toBe(TORE_ORGANIZATIONS_HREF);
    expect(getHomepageProductHref("team", UserRole.CLIENT)).toBe(
      TORE_ORGANIZATIONS_HREF,
    );
  });
});
