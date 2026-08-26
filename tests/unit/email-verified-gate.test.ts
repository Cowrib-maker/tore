import { hash } from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertUserEmailVerified,
  EmailNotVerifiedError,
} from "@/application/common/assert-email-verified";
import {
  verifyCredentials,
  type VerifyCredentialsDeps,
} from "@/application/use-cases/auth/verify-credentials";
import { UserRole, UserStatus } from "@/domain/enums";
import type { User } from "@/domain/entities/user";

function lawyer(overrides: Partial<User> = {}): User {
  return {
    id: "lawyer-1",
    email: "lawyer@example.com",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    name: "Lawyer",
    image: null,
    role: UserRole.LAWYER,
    status: UserStatus.ACTIVE,
    preferredLanguage: "mn",
    personalTenantId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("email verification gate", () => {
  it("blocks an unverified lawyer", () => {
    try {
      assertUserEmailVerified(lawyer({ emailVerified: null }));
      throw new Error("expected EMAIL_NOT_VERIFIED");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailNotVerifiedError);
      expect(error).toMatchObject({
        code: "EMAIL_NOT_VERIFIED",
        statusCode: 403,
      });
    }
  });

  it("allows a verified lawyer", () => {
    expect(() => assertUserEmailVerified(lawyer())).not.toThrow();
  });

  it("does not issue an Auth.js session for unverified credentials", () => {
    const authorize = readFileSync(
      path.join(process.cwd(), "src/infrastructure/auth/auth.config.ts"),
      "utf8",
    );
    const fn = authorize.slice(
      authorize.indexOf("async authorize"),
      authorize.indexOf("callbacks: nodeAuthCallbacks"),
    );
    expect(fn).toContain("verifyCredentials");
    expect(fn).toContain("if (!user.emailVerified)");
    expect(fn).toContain("return null");
    expect(fn.indexOf("if (!user.emailVerified)")).toBeLessThan(
      fn.indexOf("rotateActiveSessionIdHash"),
    );
  });

  it("still allows unverified credentials to be checked", async () => {
    const user = lawyer({ emailVerified: null });
    const passwordHash = await hash("correct-password", 4);
    const deps: VerifyCredentialsDeps = {
      userRepository: {
        findByEmailWithPasswordHash: async () => ({ user, passwordHash }),
      } as unknown as VerifyCredentialsDeps["userRepository"],
    };
    const result = await verifyCredentials(
      "lawyer@example.com",
      "correct-password",
      deps,
    );
    expect(result.emailVerified).toBeNull();
    expect(result.id).toBe("lawyer-1");
  });

  it("does not require emailVerified on GET billing or GET sessions", () => {
    const billingGet = readFileSync(
      path.join(process.cwd(), "src/app/api/lawyer/billing/route.ts"),
      "utf8",
    );
    const sessionsGet = readFileSync(
      path.join(process.cwd(), "src/app/api/lawyer/sessions/route.ts"),
      "utf8",
    );
    const checkout = readFileSync(
      path.join(process.cwd(), "src/app/api/lawyer/billing/checkout/route.ts"),
      "utf8",
    );
    const chat = readFileSync(
      path.join(process.cwd(), "src/app/api/ai/chat/route.ts"),
      "utf8",
    );
    const documents = readFileSync(
      path.join(process.cwd(), "src/app/api/lawyer/ai/documents/route.ts"),
      "utf8",
    );
    expect(billingGet).not.toContain("assertEmailVerified");
    expect(sessionsGet).not.toContain("assertEmailVerified");
    expect(checkout).toContain("assertEmailVerified");
    expect(chat).toContain("assertEmailVerified");
    expect(documents).toContain("assertEmailVerified");
  });
});
