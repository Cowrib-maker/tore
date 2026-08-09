import { describe, expect, it, vi } from "vitest";

import { reviewLawyerCredentialUseCase } from "@/application/use-cases/verification/review-lawyer-credential";
import { submitLawyerCredentialUseCase } from "@/application/use-cases/verification/submit-lawyer-credential";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import {
  CredentialReviewStatus,
  LawyerVerificationStatus,
  UserRole,
} from "@/domain/enums";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";

function profile(
  overrides: Partial<LawyerProfile> = {},
): LawyerProfile {
  const now = new Date();
  return {
    id: "lp1",
    userId: "lawyer1",
    slug: "bat",
    headline: null,
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    verificationStatus: LawyerVerificationStatus.PENDING,
    verifiedAt: null,
    isListed: false,
    averageRating: null,
    reviewCount: 0,
    timezone: "Asia/Ulaanbaatar",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function credential(
  overrides: Partial<LawyerCredential> = {},
): LawyerCredential {
  const now = new Date();
  return {
    id: "cred1",
    lawyerProfileId: "lp1",
    licenseNumber: "MN-1",
    issuingAuthority: "MBA",
    documentUrl: "lawyer-credential/lp1/file.pdf",
    documentFileName: "file.pdf",
    status: CredentialReviewStatus.SUBMITTED,
    rejectionReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    submittedAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe("submitLawyerCredentialUseCase", () => {
  it("uploads via FileStorage and persists an opaque key", async () => {
    const stored = {
      key: "lawyer-credential/lp1/uuid-license.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      originalFileName: "license.pdf",
    };
    const fileStorage: FileStorage = {
      upload: vi.fn().mockResolvedValue(stored),
      delete: vi.fn(),
      getObject: vi.fn(),
      getUrl: vi.fn(),
    };

    const created = credential({
      documentUrl: stored.key,
      documentFileName: stored.originalFileName,
    });

    const unitOfWork: UnitOfWork = {
      runInTransaction: async (work) =>
        work({
          userRepository: {} as never,
          clientProfileRepository: {} as never,
          lawyerProfileRepository: {
            updateVerificationStatus: vi.fn(),
          } as never,
          lawyerCredentialRepository: {
            create: vi.fn().mockResolvedValue(created),
          } as never,
          termsAcceptanceRepository: {} as never,
          auditLogRepository: {
            create: vi.fn().mockResolvedValue({}),
          } as never,
          notificationRepository: {} as never,
        }),
    };

    const result = await submitLawyerCredentialUseCase(
      { userId: "lawyer1", role: UserRole.LAWYER },
      { licenseNumber: "MN-1", issuingAuthority: "MBA" },
      {
        fileName: "license.pdf",
        contentType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      },
      {
        lawyerProfileRepository: {
          findByUserId: vi.fn().mockResolvedValue(profile()),
        } as never,
        lawyerCredentialRepository: {
          findByLawyerProfileId: vi.fn().mockResolvedValue([]),
        } as never,
        auditLogRepository: {} as never,
        fileStorage,
        unitOfWork,
      },
    );

    expect(fileStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "lawyer-credential", ownerId: "lp1" }),
    );
    expect(result.documentUrl).toBe(stored.key);
    expect(result.documentUrl.includes("/")).toBe(true);
  });

  it("rejects when a submission is already pending", async () => {
    await expect(
      submitLawyerCredentialUseCase(
        { userId: "lawyer1", role: UserRole.LAWYER },
        { licenseNumber: "MN-1", issuingAuthority: "MBA" },
        {
          fileName: "license.pdf",
          contentType: "application/pdf",
          body: new Uint8Array([1]),
        },
        {
          lawyerProfileRepository: {
            findByUserId: vi.fn().mockResolvedValue(profile()),
          } as never,
          lawyerCredentialRepository: {
            findByLawyerProfileId: vi
              .fn()
              .mockResolvedValue([credential()]),
          } as never,
          auditLogRepository: {} as never,
          fileStorage: {
            upload: vi.fn(),
            delete: vi.fn(),
            getObject: vi.fn(),
            getUrl: vi.fn(),
          },
          unitOfWork: { runInTransaction: vi.fn() },
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("reviewLawyerCredentialUseCase", () => {
  it("approves credential, profile, audits, and notifies", async () => {
    const approvedCredential = credential({
      status: CredentialReviewStatus.APPROVED,
      reviewedByUserId: "admin1",
      reviewedAt: new Date(),
    });
    const approvedProfile = profile({
      verificationStatus: LawyerVerificationStatus.APPROVED,
      verifiedAt: new Date(),
    });

    const review = vi.fn().mockResolvedValue(approvedCredential);
    const updateVerificationStatus = vi.fn().mockResolvedValue(approvedProfile);
    const auditCreate = vi.fn().mockResolvedValue({});
    const notifyCreate = vi.fn().mockResolvedValue({});
    const findById = vi.fn().mockResolvedValue(approvedProfile);

    const unitOfWork: UnitOfWork = {
      runInTransaction: async (work) =>
        work({
          userRepository: {} as never,
          clientProfileRepository: {} as never,
          lawyerProfileRepository: {
            updateVerificationStatus,
            update: vi.fn(),
            findById,
          } as never,
          lawyerCredentialRepository: { review } as never,
          termsAcceptanceRepository: {} as never,
          auditLogRepository: { create: auditCreate } as never,
          notificationRepository: { create: notifyCreate } as never,
        }),
    };

    const result = await reviewLawyerCredentialUseCase(
      { userId: "admin1", role: UserRole.ADMIN },
      {
        credentialId: "cred1",
        decision: CredentialReviewStatus.APPROVED,
      },
      {
        lawyerCredentialRepository: {
          findById: vi.fn().mockResolvedValue(credential()),
        } as never,
        unitOfWork,
      },
    );

    expect(result.profile.verificationStatus).toBe(
      LawyerVerificationStatus.APPROVED,
    );
    expect(updateVerificationStatus).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalled();
    expect(notifyCreate).toHaveBeenCalled();
  });
});
