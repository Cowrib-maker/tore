import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertPasswordResetTokenValid,
  requestPasswordResetUseCase,
  resetPasswordWithTokenUseCase,
} from "@/application/use-cases/auth/password-reset";
import {
  buildPasswordResetUrl,
  generatePasswordResetRawToken,
  hashPasswordResetToken,
  passwordResetIdentifier,
  parsePasswordResetIdentifier,
} from "@/domain/services/password-reset-token";
import { UserRole, UserStatus } from "@/domain/enums";
import { ValidationError } from "@/domain/errors/domain-error";

describe("password reset token helpers", () => {
  it("hashes deterministically and builds reset URL", () => {
    const raw = "abc123token";
    expect(hashPasswordResetToken(raw)).toHaveLength(64);
    expect(hashPasswordResetToken(raw)).toBe(hashPasswordResetToken(raw));
    expect(generatePasswordResetRawToken()).toHaveLength(64);
    expect(parsePasswordResetIdentifier(passwordResetIdentifier("A@B.com"))).toBe(
      "a@b.com",
    );
    expect(
      buildPasswordResetUrl({
        appUrl: "http://localhost:3000/",
        rawToken: raw,
      }),
    ).toBe("http://localhost:3000/reset-password?token=abc123token");
  });
});

describe("password reset use cases", () => {
  const user = {
    id: "u1",
    email: "user@example.com",
    name: "User",
    role: UserRole.CLIENT,
    status: UserStatus.ACTIVE,
    preferredLanguage: "en" as const,
    personalTenantId: null,
    emailVerifiedAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let emailVerificationTokenRepository: {
    replaceForIdentifier: ReturnType<typeof vi.fn>;
    findByTokenHash: ReturnType<typeof vi.fn>;
    deleteByTokenHash: ReturnType<typeof vi.fn>;
    deleteForIdentifier: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByEmailWithPasswordHash: ReturnType<typeof vi.fn>;
    updatePasswordHash: ReturnType<typeof vi.fn>;
  };
  let emailSender: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    emailVerificationTokenRepository = {
      replaceForIdentifier: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn(),
      deleteByTokenHash: vi.fn().mockResolvedValue(undefined),
      deleteForIdentifier: vi.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findByEmail: vi.fn(),
      findByEmailWithPasswordHash: vi.fn(),
      updatePasswordHash: vi.fn().mockResolvedValue(user),
    };
    emailSender = { send: vi.fn().mockResolvedValue(undefined) };
  });

  function deps() {
    return {
      userRepository: userRepository as never,
      emailVerificationTokenRepository:
        emailVerificationTokenRepository as never,
      emailSender: emailSender as never,
      appUrl: "http://localhost:3000",
      appName: "TORE",
    };
  }

  it("never reveals whether an email exists", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    await expect(
      requestPasswordResetUseCase("missing@example.com", deps()),
    ).resolves.toEqual({ ok: true });
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("stores a hashed token and emails a reset link for known users", async () => {
    userRepository.findByEmail.mockResolvedValue(user);
    userRepository.findByEmailWithPasswordHash.mockResolvedValue({
      user,
      passwordHash: "hash",
    });

    await expect(
      requestPasswordResetUseCase("user@example.com", deps()),
    ).resolves.toEqual({ ok: true });

    expect(emailVerificationTokenRepository.replaceForIdentifier).toHaveBeenCalled();
    const call =
      emailVerificationTokenRepository.replaceForIdentifier.mock.calls[0]?.[0];
    expect(call.identifier).toBe("pwdreset:user@example.com");
    expect(call.tokenHash).toHaveLength(64);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const sent = emailSender.send.mock.calls[0]?.[0];
    expect(sent.text).toContain("/reset-password?token=");
    expect(sent.text).not.toContain(call.tokenHash);
  });

  it("resets password once then rejects token reuse", async () => {
    const raw = "a".repeat(64);
    const tokenHash = hashPasswordResetToken(raw);
    emailVerificationTokenRepository.findByTokenHash
      .mockResolvedValueOnce({
        identifier: "pwdreset:user@example.com",
        tokenHash,
        expires: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce(null);

    userRepository.findByEmailWithPasswordHash.mockResolvedValue({
      user,
      passwordHash: "old",
    });

    await expect(
      resetPasswordWithTokenUseCase(
        { rawToken: raw, newPassword: "Newpass1" },
        deps(),
      ),
    ).resolves.toEqual({ ok: true });

    expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
      "u1",
      expect.any(String),
    );
    expect(emailVerificationTokenRepository.deleteByTokenHash).toHaveBeenCalledWith(
      tokenHash,
    );

    await expect(
      resetPasswordWithTokenUseCase(
        { rawToken: raw, newPassword: "Newpass2" },
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects expired tokens", async () => {
    const raw = "b".repeat(64);
    emailVerificationTokenRepository.findByTokenHash.mockResolvedValue({
      identifier: "pwdreset:user@example.com",
      tokenHash: hashPasswordResetToken(raw),
      expires: new Date(Date.now() - 1000),
    });
    await expect(
      assertPasswordResetTokenValid(raw, {
        emailVerificationTokenRepository:
          emailVerificationTokenRepository as never,
      }),
    ).resolves.toEqual({ valid: false });
  });
});
