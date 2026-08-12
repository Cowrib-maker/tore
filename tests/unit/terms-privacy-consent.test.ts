import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  registerClientSchema,
  resetPasswordSchema,
} from "@/application/validators/auth.schema";
import { en } from "@/i18n/dictionaries/en";

describe("auth consent + password schemas", () => {
  it("requires terms acceptance on registration", () => {
    const rejected = registerClientSchema.safeParse({
      name: "Ada Client",
      email: "ada@example.com",
      password: "Password1",
      acceptTerms: false,
      preferredLanguage: "en",
    });
    expect(rejected.success).toBe(false);

    const accepted = registerClientSchema.safeParse({
      name: "Ada Client",
      email: "ada@example.com",
      password: "Password1",
      acceptTerms: true,
      preferredLanguage: "en",
    });
    expect(accepted.success).toBe(true);
  });

  it("publishes terms and privacy dictionary routes", () => {
    expect(en.legal.termsTitle.length).toBeGreaterThan(3);
    expect(en.legal.privacyTitle.length).toBeGreaterThan(3);
    expect(en.legal.placeholderBanner.toLowerCase()).toContain("placeholder");
    expect(en.auth.termsOfService).toBeTruthy();
    expect(en.auth.privacyPolicy).toBeTruthy();
  });

  it("validates forgot/reset password payloads", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "user@example.com" }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({
        token: "raw",
        password: "Password1",
        confirmPassword: "Password1",
      }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({
        token: "raw",
        password: "Password1",
        confirmPassword: "Mismatch1",
      }).success,
    ).toBe(false);
  });
});
