import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  resendEmailVerificationUseCase,
  sendEmailVerificationUseCase,
  verifyEmailOtpUseCase,
} from "@/application/use-cases/auth/email-verification";
import { buildEmailVerificationMessage } from "@/application/services/email-verification-message";
import {
  EmailAlreadyVerifiedError,
  EmailConfigurationError,
  EmailDeliveryError,
  EmailNotFoundError,
  EmailVerificationLinkError,
} from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
import {
  EMAIL_VERIFICATION_OTP_TTL_MINUTES,
  emailVerificationHashesMatch,
  emailVerificationOtpExpiry,
  formatResendCountdown,
  generateEmailVerificationOtp,
  generateEmailVerificationRawToken,
  hashEmailVerificationOtp,
  hashEmailVerificationToken,
} from "@/domain/services/email-verification-token";
import { resolveEmailProvider } from "@/infrastructure/email/resolve-email-provider";
import {
  createEmailSender,
  resetEmailSenderForTests,
} from "@/infrastructure/email";
import type { Env } from "@/lib/env";
import type { EmailVerificationToken } from "@/domain/repositories/email-verification-token-repository";

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

function memoryTokenRepo() {
  const rows = new Map<string, EmailVerificationToken>();
  return {
    replaceForIdentifier: vi.fn(async (input: EmailVerificationToken) => {
      rows.set(input.identifier, { ...input });
    }),
    findByIdentifier: vi.fn(async (identifier: string) => {
      return rows.get(identifier) ?? null;
    }),
    findByTokenHash: vi.fn(async (tokenHash: string) => {
      return (
        [...rows.values()].find((row) => row.tokenHash === tokenHash) ?? null
      );
    }),
    deleteByTokenHash: vi.fn(async (tokenHash: string) => {
      for (const [key, row] of rows) {
        if (row.tokenHash === tokenHash) rows.delete(key);
      }
    }),
    deleteForIdentifier: vi.fn(async (identifier: string) => {
      rows.delete(identifier);
    }),
  };
}

describe("email verification OTP helpers", () => {
  it("generates a 6-digit code and stores only an email-bound hash", () => {
    const otp = generateEmailVerificationOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(generateEmailVerificationRawToken()).toHaveLength(64);

    const hash = hashEmailVerificationOtp("Client@Example.com", "042891");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashEmailVerificationOtp("client@example.com", "042891"));
    expect(hash).not.toBe(hashEmailVerificationOtp("other@example.com", "042891"));
    expect(hash).not.toBe(hashEmailVerificationToken("042891"));
    expect(emailVerificationHashesMatch(hash, hash)).toBe(true);
    expect(
      emailVerificationHashesMatch(
        hash,
        hashEmailVerificationOtp("client@example.com", "000000"),
      ),
    ).toBe(false);
  });

  it("expires OTPs after 10 minutes and formats the resend countdown", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(emailVerificationOtpExpiry(EMAIL_VERIFICATION_OTP_TTL_MINUTES, now)).toEqual(
      new Date("2026-08-26T12:10:00.000Z"),
    );
    expect(formatResendCountdown(59)).toBe("00:59");
    expect(formatResendCountdown(0)).toBe("00:00");
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

  it("treats missing Resend/SMTP credentials as configuration failure, not app logic", () => {
    resetEmailSenderForTests();
    expect(() =>
      createEmailSender(envStub({ EMAIL_PROVIDER: "resend" })),
    ).toThrow(EmailConfigurationError);
    expect(() =>
      createEmailSender(envStub({ EMAIL_PROVIDER: "smtp" })),
    ).toThrow(EmailConfigurationError);
    expect(() =>
      createEmailSender(
        envStub({ NODE_ENV: "production", EMAIL_PROVIDER: "auto" }),
      ),
    ).toThrow(EmailConfigurationError);
  });
});

function otpFromSentMail(emailSend: ReturnType<typeof vi.fn>): string {
  const text = (emailSend.mock.calls[0]?.[0] as { text?: string } | undefined)
    ?.text;
  const match = text?.match(/Таны TORE баталгаажуулах код:\n(\d{6})/);
  if (!match?.[1]) {
    throw new Error("expected a 6-digit OTP in the verification email");
  }
  return match[1];
}

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
  let tokens: ReturnType<typeof memoryTokenRepo>;

  beforeEach(() => {
    vi.restoreAllMocks();
    emailSend = vi.fn().mockResolvedValue({ messageId: "msg_1" });
    tokens = memoryTokenRepo();
    deps = {
      userRepository: {
        findByEmail: vi.fn().mockResolvedValue(user),
        markEmailVerified: vi.fn().mockResolvedValue({
          ...user,
          emailVerified: new Date(),
        }),
      } as never,
      emailVerificationTokenRepository: tokens as never,
      emailSender: { send: emailSend },
      appUrl: "http://localhost:3000",
      appName: "TORE",
      ttlMinutes: EMAIL_VERIFICATION_OTP_TTL_MINUTES,
    };
  });

  it("persists a hashed OTP and emails the 6-digit code in Mongolian", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendEmailVerificationUseCase("client@example.com", deps);

    const otp = otpFromSentMail(emailSend);
    const stored = tokens.replaceForIdentifier.mock.calls[0]?.[0];
    expect(stored).toEqual(
      expect.objectContaining({
        identifier: "client@example.com",
        tokenHash: hashEmailVerificationOtp("client@example.com", otp),
      }),
    );
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).not.toBe(otp);
    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: "TORE — И-мэйл баталгаажуулах код",
        text: expect.stringContaining("Таны TORE баталгаажуулах код:"),
      }),
    );
    const sent = emailSend.mock.calls[0]?.[0] as {
      text: string;
      html: string;
    };
    expect(sent.text).toContain(otp);
    expect(sent.text).toContain("Энэ код 10 минутын хугацаанд хүчинтэй.");
    expect(sent.text).not.toContain("/verify-email?token=");
    expect(sent.html).toContain(otp);
    expect(info.mock.calls.some((call) => call.includes(otp))).toBe(false);
    expect(JSON.stringify(info.mock.calls.map((call) => call[1]))).not.toMatch(
      /"otp"/,
    );
    info.mockRestore();
  });

  it("resend rejects unknown emails without sending mail", async () => {
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    await expect(
      resendEmailVerificationUseCase("unknown@example.com", deps),
    ).rejects.toBeInstanceOf(EmailNotFoundError);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("verifies a valid OTP and marks the user verified", async () => {
    await sendEmailVerificationUseCase(user.email, deps);
    const otp = otpFromSentMail(emailSend);

    const result = await verifyEmailOtpUseCase(
      { email: user.email, otp },
      deps,
    );

    expect(result.email).toBe(user.email);
    expect(result.role).toBe(UserRole.CLIENT);
    expect(deps.userRepository.markEmailVerified).toHaveBeenCalledWith(user.id);
    expect(tokens.deleteForIdentifier).toHaveBeenCalledWith(user.email);
  });

  it("rejects an invalid OTP without consuming it", async () => {
    await sendEmailVerificationUseCase(user.email, deps);

    await expect(
      verifyEmailOtpUseCase({ email: user.email, otp: "000000" }, deps),
    ).rejects.toMatchObject({ reason: "invalid" });
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(await tokens.findByIdentifier(user.email)).not.toBeNull();
  });

  it("rejects an expired OTP without marking the user verified", async () => {
    await tokens.replaceForIdentifier({
      identifier: user.email,
      tokenHash: hashEmailVerificationOtp(user.email, "123456"),
      expires: new Date(Date.now() - 1_000),
    });

    await expect(
      verifyEmailOtpUseCase({ email: user.email, otp: "123456" }, deps),
    ).rejects.toMatchObject({
      name: "EmailVerificationLinkError",
      reason: "expired",
      code: "EMAIL_VERIFICATION_INVALID",
    });
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(tokens.deleteForIdentifier).toHaveBeenCalledWith(user.email);
  });

  it("rejects a reused OTP after successful verification", async () => {
    await sendEmailVerificationUseCase(user.email, deps);
    const otp = otpFromSentMail(emailSend);
    await verifyEmailOtpUseCase({ email: user.email, otp }, deps);

    await expect(
      verifyEmailOtpUseCase({ email: user.email, otp }, deps),
    ).rejects.toBeInstanceOf(EmailVerificationLinkError);
    expect(deps.userRepository.markEmailVerified).toHaveBeenCalledTimes(1);
  });

  it("resend creates a hashed OTP and sends mail for unverified accounts", async () => {
    const result = await resendEmailVerificationUseCase(
      "client@example.com",
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(tokens.replaceForIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "client@example.com",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expires: expect.any(Date),
      }),
    );
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  it("resend does not send for already-verified accounts", async () => {
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ...user, emailVerified: new Date() },
    );
    await expect(
      resendEmailVerificationUseCase("client@example.com", deps),
    ).rejects.toBeInstanceOf(EmailAlreadyVerifiedError);
    expect(emailSend).not.toHaveBeenCalled();
    expect(tokens.replaceForIdentifier).not.toHaveBeenCalled();
  });

  it("verify rejects an already-verified user without revealing the code", async () => {
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ...user, emailVerified: new Date() },
    );
    try {
      await verifyEmailOtpUseCase({ email: user.email, otp: "123456" }, deps);
      throw new Error("expected EmailAlreadyVerifiedError");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailAlreadyVerifiedError);
      expect(String(error)).not.toMatch(/123456|prisma|smtp|resend|hash|sha256/i);
    }
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it("resend surfaces delivery failure after the token is persisted", async () => {
    emailSend.mockRejectedValue(new Error("smtp_timeout"));
    await expect(
      resendEmailVerificationUseCase("client@example.com", deps),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
    expect(tokens.replaceForIdentifier).toHaveBeenCalled();
  });

  it("resend surfaces provider configuration failure separately from delivery", async () => {
    emailSend.mockRejectedValue(
      new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY"),
    );
    await expect(
      resendEmailVerificationUseCase("client@example.com", deps),
    ).rejects.toBeInstanceOf(EmailConfigurationError);
  });

  it("rejects an invalid OTP without revealing internals", async () => {
    try {
      await verifyEmailOtpUseCase({ email: user.email, otp: "111111" }, deps);
      throw new Error("expected EmailVerificationLinkError");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailVerificationLinkError);
      expect(error).toMatchObject({ reason: "invalid" });
      expect(String(error)).not.toMatch(/prisma|smtp|resend|hash|sha256|111111/i);
    }
    expect(deps.userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it("verifies a lawyer OTP and returns the professional role", async () => {
    const lawyer = { ...user, role: UserRole.LAWYER, email: "lawyer@example.com" };
    (deps.userRepository.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      lawyer,
    );
    await sendEmailVerificationUseCase(lawyer.email, deps);
    const otp = otpFromSentMail(emailSend);

    const result = await verifyEmailOtpUseCase(
      { email: lawyer.email, otp },
      deps,
    );
    expect(result).toEqual({ email: lawyer.email, role: UserRole.LAWYER });
  });
});

describe("email verification message", () => {
  it("builds the required Mongolian OTP template", () => {
    const message = buildEmailVerificationMessage({
      appName: "TORE",
      toName: "Ada",
      otp: "102938",
      ttlMinutes: 10,
    });
    expect(message.subject).toBe("TORE — И-мэйл баталгаажуулах код");
    expect(message.text).toContain("Таны TORE баталгаажуулах код:");
    expect(message.text).toContain("102938");
    expect(message.text).toContain("Энэ код 10 минутын хугацаанд хүчинтэй.");
  });
});
