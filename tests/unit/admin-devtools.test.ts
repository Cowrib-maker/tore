import { afterEach, describe, expect, it, vi } from "vitest";

import { assertAdminDevtoolsEnabled } from "@/application/common/assert-admin-devtools";
import {
  assertCanImpersonateTarget,
  makeLawyerDirectoryReadyDev,
} from "@/application/use-cases/admin/admin-devtools";
import {
  ConsultationModality,
  LawyerVerificationStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import {
  ADMIN_DEVTOOLS_V1_FLAG,
  isAdminDevtoolsEnabled,
} from "@/lib/feature-flags";

describe("admin devtools gate", () => {
  afterEach(() => {
    delete process.env[ADMIN_DEVTOOLS_V1_FLAG];
    vi.unstubAllEnvs();
  });

  it("is off by default and hard-disabled in production", () => {
    delete process.env[ADMIN_DEVTOOLS_V1_FLAG];
    expect(isAdminDevtoolsEnabled()).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    process.env[ADMIN_DEVTOOLS_V1_FLAG] = "1";
    expect(isAdminDevtoolsEnabled()).toBe(false);
    expect(() => assertAdminDevtoolsEnabled()).toThrow(ForbiddenError);
  });

  it("enables only when flag is 1 outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env[ADMIN_DEVTOOLS_V1_FLAG] = "1";
    expect(isAdminDevtoolsEnabled()).toBe(true);
    expect(() => assertAdminDevtoolsEnabled()).not.toThrow();
  });
});

describe("admin devtools use-cases", () => {
  afterEach(() => {
    delete process.env[ADMIN_DEVTOOLS_V1_FLAG];
    vi.unstubAllEnvs();
  });

  function enableDevtools() {
    vi.stubEnv("NODE_ENV", "test");
    process.env[ADMIN_DEVTOOLS_V1_FLAG] = "1";
  }

  it("rejects impersonating admins", async () => {
    enableDevtools();
    await expect(
      assertCanImpersonateTarget(
        { userId: "admin-1", role: UserRole.ADMIN },
        "admin-2",
        {
          userRepository: {
            findById: vi.fn().mockResolvedValue({
              id: "admin-2",
              email: "a2@tore.mn",
              role: UserRole.ADMIN,
              status: UserStatus.ACTIVE,
              deletedAt: null,
            }),
          } as never,
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("makes a lawyer directory-ready in one pass", async () => {
    enableDevtools();

    const profile = {
      id: "lp1",
      userId: "lawyer-1",
      isListed: false,
      verificationStatus: LawyerVerificationStatus.PENDING,
      deletedAt: null,
    };

    const deps = {
      userRepository: {
        findById: vi.fn().mockResolvedValue({
          id: "lawyer-1",
          email: "l@tore.mn",
          role: UserRole.LAWYER,
          status: UserStatus.ACTIVE,
          emailVerified: null,
          deletedAt: null,
        }),
        markEmailVerified: vi.fn().mockResolvedValue({
          id: "lawyer-1",
          email: "l@tore.mn",
          role: UserRole.LAWYER,
          status: UserStatus.ACTIVE,
          emailVerified: new Date(),
          deletedAt: null,
        }),
      },
      lawyerProfileRepository: {
        findByUserId: vi.fn().mockResolvedValue(profile),
        findById: vi.fn().mockResolvedValue({
          ...profile,
          isListed: true,
          verificationStatus: LawyerVerificationStatus.APPROVED,
        }),
        updateVerificationStatus: vi.fn().mockResolvedValue({
          ...profile,
          verificationStatus: LawyerVerificationStatus.APPROVED,
        }),
        update: vi.fn().mockResolvedValue({
          ...profile,
          isListed: true,
          verificationStatus: LawyerVerificationStatus.APPROVED,
        }),
      },
      lawyerCredentialRepository: {},
      consultationOfferingRepository: {
        findByLawyerProfileId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: "off1",
          lawyerProfileId: "lp1",
          titleMn: "Dev consultation",
          isActive: true,
          modality: ConsultationModality.ONLINE,
          deletedAt: null,
        }),
      },
      unitOfWork: {
        runInTransaction: vi.fn(async (work) =>
          work({
            auditLogRepository: { create: vi.fn() },
          } as never),
        ),
      },
    } as never;

    const result = await makeLawyerDirectoryReadyDev(
      { userId: "admin-1", role: UserRole.ADMIN },
      "lawyer-1",
      deps as never,
    );

    expect(result.profile.isListed).toBe(true);
    expect(result.offering.isActive).toBe(true);
    expect(
      (deps as { userRepository: { markEmailVerified: ReturnType<typeof vi.fn> } })
        .userRepository.markEmailVerified,
    ).toHaveBeenCalledWith("lawyer-1");
    expect(
      (
        deps as {
          lawyerProfileRepository: {
            updateVerificationStatus: ReturnType<typeof vi.fn>;
          };
        }
      ).lawyerProfileRepository.updateVerificationStatus,
    ).toHaveBeenCalledWith(
      "lp1",
      LawyerVerificationStatus.APPROVED,
      expect.any(Date),
    );
  });
});
