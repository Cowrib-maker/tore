import { describe, expect, it } from "vitest";

import {
  isProtectedAppRoute,
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
  });
});
