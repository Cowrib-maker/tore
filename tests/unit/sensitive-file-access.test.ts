import { describe, expect, it, vi } from "vitest";

import { assertCanAccessStoredFile } from "@/application/services/assert-can-access-stored-file";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import {
  buildAppFilePath,
  isSensitiveStorageKey,
} from "@/infrastructure/storage/file-access";

describe("sensitive file access", () => {
  const key = "lawyer-credential/lp1/doc.pdf";

  const deps = {
    lawyerProfileRepository: {
      findByUserId: vi.fn(),
    },
    lawyerCredentialRepository: {
      findByLawyerProfileId: vi.fn(),
    },
  };

  it("marks credential keys as sensitive and builds app paths", () => {
    expect(isSensitiveStorageKey(key)).toBe(true);
    expect(isSensitiveStorageKey("profile-photo/u1/a.jpg")).toBe(false);
    expect(isSensitiveStorageKey("legal-ai-document/u1/uuid-a.pdf")).toBe(true);
    expect(buildAppFilePath(key)).toBe(
      "/api/files/lawyer-credential/lp1/doc.pdf",
    );
    expect(buildAppFilePath("legal-ai-document/u1/uuid-a.pdf")).toBe(
      "/api/files/legal-ai-document/u1/uuid-a.pdf",
    );
  });

  it("allows admins", async () => {
    await expect(
      assertCanAccessStoredFile(
        { userId: "admin1", role: UserRole.ADMIN },
        key,
        deps as never,
      ),
    ).resolves.toBeUndefined();
  });

  it("allows the owning lawyer when the credential lists the key", async () => {
    deps.lawyerProfileRepository.findByUserId.mockResolvedValue({
      id: "lp1",
      userId: "lawyer1",
    });
    deps.lawyerCredentialRepository.findByLawyerProfileId.mockResolvedValue([
      { documentUrl: key },
    ]);

    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer1", role: UserRole.LAWYER },
        key,
        deps as never,
      ),
    ).resolves.toBeUndefined();
  });

  it("denies another lawyer", async () => {
    deps.lawyerProfileRepository.findByUserId.mockResolvedValue({
      id: "lp-other",
      userId: "lawyer2",
    });

    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer2", role: UserRole.LAWYER },
        key,
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows the owning lawyer to download case evidence and denies others", async () => {
    const evidenceKey = "evidence/lawyer1/uuid-contract.pdf";
    const evidenceDeps = {
      ...deps,
      findOwnedEvidenceByFileReference: vi.fn(async (ownerId: string, key: string) =>
        ownerId === "lawyer1" && key === evidenceKey
          ? { id: "ev1", caseFileId: "case-1" }
          : null,
      ),
    };

    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer1", role: UserRole.LAWYER },
        evidenceKey,
        evidenceDeps as never,
      ),
    ).resolves.toBeUndefined();

    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer2", role: UserRole.LAWYER },
        evidenceKey,
        evidenceDeps as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
