import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  resendEmailVerificationUseCase,
  sendEmailVerificationUseCase,
  verifyEmailTokenUseCase,
} from "@/application/use-cases/auth/email-verification";
import { EmailVerificationLinkError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
import {
  buildEmailVerificationUrl,
  generateEmailVerificationRawToken,
  hashEmailVerificationToken,
} from "@/domain/services/email-verification-token";
import { resolveEmailProvider } from "@/infrastructure/email/resolve-email-provider";
import type { Env } from "@/lib/env";

function envStub(overrides: Partial<Env>): Env {
  return {
    DATABASE_URL: "postgresql://localhost/tore",
    AUTH_SECRET: "test-auth-secret-minimum-32-characters",
    NEXT_PUBLIC_APP_NAME: "TORE",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NODE_ENV: "development",
    FILE_STORAGE: "local",
    FILE_STORAGE_LOCAL_ROOT: ".data/uploads",
    EMAIL_PROVIDER: "auto",
    EMAIL_FROM: "TORE <noreply@tore.mn>",
    EMAIL_VERIFICATION_TTL_HOURS: 24,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    ...overrides,
  } as Env;
}

describe("email verification token helpers", () => {
  it("hashes tokens deterministically and builds a correct verify URL", () => {
    const raw = "abc123token";
    expect(hashEmailVerificationToken(raw)).toHaveLength(64);
    expect(hashEmailVerificationToken(raw)).toBe(hashEmailVerificationToken(raw));
    expect(generateEmailVerificationRawToken()).toHaveLength(64);

    const url = buildEmailVerificationUrl({
      appUrl: "http://localhost:3000/",
      rawToken: raw,
    });
    expect(url).toBe("http://localhost:3000/verify-email?token=abc123token");
  });
});

describe("resolveEmailProvider", () => {
  it("uses console for local auto mode even if Resend key is present", () => {
    expect(
      resolveEmailProvider(
        envStub({
          NODE_ENV: "development",
          EMAIL_PROVIDER: "auto",
          RESEND_API_KEY: "re_test",
        }),
      ),
    ).toBe("console");
  });

  it("auto-selects Resend in production when API key is set", () => {
    expect(
      resolveEmailProvider(
        envStub({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "auto",
          RESEND_API_KEY: "re_live",
        }),
      ),
    ).toBe("resend");
  });

  it("falls back to SMTP in production when only SMTP_HOST is set", () => {
    expect(
      resolveEmailProvider(
        envStub({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "auto",
          SMTP_HOST: "smtp.example.com",
        }),
      ),
    ).toBe("smtp");
  });

  it("honors explicit EMAIL_PROVIDER overrides", () => {
    expect(
      resolveEmailProvider(
        envStub({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com" }),
      ),
    ).toBe("smtp");
  });
});

describe("email-verification use-cases", () => {
  const user = {
    id: "u1",
    email: "client@example.com",
    emailVerified: null,
    name: "Ada",
    image: null,
    role: "CLIENT" as const,
    status: "ACTIVE" as const,
    preferredLanguage: "en",
    personalTenantId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let deps: Parameters<typeof sendEmailVerificationUseCase>[1];
  let emailSend: ReturnType<typeof vi.fn>;
  let replaceForIdentifier: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emailSend = vi.fn().mockResolvedValue({ messageId: "msg_1" });
    replaceForIdentifier = vi.fn().mockResolvedValue(undefined);
    deps = {
      userRepository: {
        findByEmail: vi.fn().mockResolvedValue(user),
        markEmailVerified: vi.fn().mockResolvedValue({
          ...user,
          emailVerified: new Date(),
        }),
      } as never,
      emailVerificationTokenRepository: {
        replaceForIdentifier,
        findByTokenHash: vi.fn(),
        deleteByTokenHash: vi.fn(),
        deleteForIdentifier: vi.fn(),
      } as never,
      emailSender: { send: emailSend },
      appUrl: "http://localhost:3000",
      appName: "TORE",
      ttlHours: 24,
    };
  });

  it("persists a hashed token and sends verification mail", async () => {
    await sendEmailVerificationUseCase("client@example.com", deps);

    expect(replaceForIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "client@example.com",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: expect.stringContaining("Confirm"),
        text: expect.stringContaining("/verify-email?token="),
      }),
    );
  });

  it("logs-friendly resend hides unknown emails", async () => {
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const result = await resendEmailVerificationUseCase(
      "unknown@example.com",
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("verifies a valid token and marks the user verified", async () => {
    const raw = generateEmailVerificationRawToken();
    const tokenHash = hashEmailVerificationToken(raw);
    (
      deps.emailVerificationTokenRepository.findByTokenHash as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({
      identifier: user.email,
      tokenHash,
      expires: new Date(Date.now() + 60_000),
    });

    const result = await verifyEmailTokenUseCase(raw, deps);

    expect(result.email).toBe(user.email);
    expect(result.role).toBe(UserRole.CLIENT);
    expect(deps.userRepository.markEmailVerified).toHaveBeenCalledWith(user.id);
    expect(
      deps.emailVerificationTokenRepository.deleteForIdentifier,
    ).toHaveBeenCalledWith(user.email);
  });

  it("resend creates a hashed token and sends mail for unverified accounts", async () => {
    const result = await resendEmailVerificationUseCase(
      "client@example.com",
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(replaceForIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "client@example.com",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expires: expect.any(Date),
      }),
    );
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  it("resend does not send for already-verified accounts and hides existence", async () => {
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ...user, emailVerified: new Date() },
    );
    const result = await resendEmailVerificationUseCase(
      "client@example.com",
      deps,
    );
    expect(result).toEqual({ ok: true, alreadyVerified: true });
    expect(emailSend).not.toHaveBeenCalled();
    expect(replaceForIdentifier).not.toHaveBeenCalled();
  });

  it("resend still returns success when send fails after a token is persisted", async () => {
    emailSend.mockRejectedValue(new Error("smtp_timeout"));
    const result = await resendEmailVerificationUseCase(
      "client@example.com",
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(replaceForIdentifier).toHaveBeenCalled();
  });

  it("rejects an expired token without marking the user verified", async () => {
    const raw = generateEmailVerificationRawToken();
    const tokenHash = hashEmailVerificationToken(raw);
    (
      deps.emailVerificationTokenRepository.findByTokenHash as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({
      identifier: user.email,
      tokenHash,
      expires: new Date(Date.now() - 1_000),
    });

    await expect(verifyEmailTokenUseCase(raw, deps)).rejects.toMatchObject({
      name: "EmailVerificationLinkError",
      reason: "expired",
      code: "EMAIL_VERIFICATION_INVALID",
    });
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(
      deps.emailVerificationTokenRepository.deleteByTokenHash,
    ).toHaveBeenCalledWith(tokenHash);
  });

  it("rejects an invalid token without revealing internals", async () => {
    (
      deps.emailVerificationTokenRepository.findByTokenHash as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue(null);

    try {
      await verifyEmailTokenUseCase(generateEmailVerificationRawToken(), deps);
      throw new Error("expected EmailVerificationLinkError");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailVerificationLinkError);
      expect(error).toMatchObject({ reason: "invalid" });
      expect(String(error)).not.toMatch(/prisma|smtp|resend|hash|sha256/i);
    }
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it("verifies a lawyer token and returns the professional role", async () => {
    const lawyer = { ...user, role: UserRole.LAWYER, email: "lawyer@example.com" };
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      lawyer,
    );
    const raw = generateEmailVerificationRawToken();
    (
      deps.emailVerificationTokenRepository.findByTokenHash as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({
      identifier: lawyer.email,
      tokenHash: hashEmailVerificationToken(raw),
      expires: new Date(Date.now() + 60_000),
    });

    const result = await verifyEmailTokenUseCase(raw, deps);
    expect(result).toEqual({ email: lawyer.email, role: UserRole.LAWYER });
  });
});
