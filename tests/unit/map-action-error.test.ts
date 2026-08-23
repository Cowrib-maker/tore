import { describe, expect, it } from "vitest";

import { mapActionError } from "@/application/common/map-action-error";
import { UnauthorizedError, ValidationError } from "@/domain/errors/domain-error";

describe("mapActionError", () => {
  it("maps Auth.js CredentialsSignin to invalid credentials, not an unexpected error", () => {
    const error = Object.assign(new Error("CredentialsSignin"), {
      type: "CredentialsSignin",
      name: "CredentialsSignin",
      kind: "signIn",
      code: "credentials",
    });

    expect(mapActionError(error)).toEqual({
      error: "Invalid email or password",
    });
  });

  it("keeps domain validation messages", () => {
    expect(mapActionError(new ValidationError("Enter a valid email address"))).toEqual({
      error: "Enter a valid email address",
    });
  });

  it("maps unauthorized domain errors", () => {
    expect(mapActionError(new UnauthorizedError("Invalid email or password"))).toEqual({
      error: "Please sign in to continue.",
    });
  });
});
