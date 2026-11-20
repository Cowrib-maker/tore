import { describe, expect, it, vi } from "vitest";

import { uploadProfilePhotoUseCase } from "@/application/use-cases/profiles/upload-profile-photo";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";
import { UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const admin = { userId: "u-admin", role: UserRole.ADMIN };
const TARGET = "u-lawyer";

function setup(
  options: {
    image?: string | null;
    targetRole?: UserRole;
    hasProfile?: boolean;
    missingUser?: boolean;
  } = {},
) {
  const user = (image: string | null) =>
    ({ id: TARGET, role: options.targetRole ?? UserRole.LAWYER, image }) as never;
  const upload = vi.fn(async (input: { ownerId: string; contentType: string; body: Uint8Array }) => ({
    key: `profile-photo/${input.ownerId}/new-uuid.img`,
    contentType: input.contentType,
    sizeBytes: input.body.byteLength,
    originalFileName: "x",
  }));
  const del = vi.fn(async () => undefined);
  const updateProfile = vi.fn(async (_id: string, patch: { image?: string }) =>
    user(patch.image ?? null),
  );
  const create = vi.fn(async () => ({}));
  const deps = {
    userRepository: {
      findById: vi.fn(async () => (options.missingUser ? null : user(options.image ?? null))),
      updateProfile,
    },
    lawyerProfileRepository: {
      findByUserId: vi.fn(async () =>
        options.hasProfile === false ? null : ({ id: "lp1", userId: TARGET } as never),
      ),
    },
    auditLogRepository: { create },
    fileStorage: { upload, delete: del },
  } as never;
  return { deps, upload, del, updateProfile, create };
}

const file = (body: Uint8Array, contentType = "image/png") => ({
  fileName: "me.png",
  contentType,
  body,
});
const run = (body: Uint8Array, deps: never, actor = admin, target = TARGET) =>
  uploadProfilePhotoUseCase(actor, target, file(body), deps);

describe("uploadProfilePhotoUseCase (admin-only)", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
  ])("lets an admin set a lawyer's %s photo", async (_n, body, mime) => {
    const { deps, upload, updateProfile, create } = setup();
    await uploadProfilePhotoUseCase(admin, TARGET, file(body, "application/octet-stream"), deps, "1.2.3.4");
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "profile-photo", ownerId: TARGET, contentType: mime }),
    );
    expect(updateProfile).toHaveBeenCalledWith(TARGET, {
      image: `profile-photo/${TARGET}/new-uuid.img`,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u-admin",
        entityId: TARGET,
        metadata: { field: "profilePhoto", targetUserId: TARGET },
      }),
    );
  });

  it.each([UserRole.LAWYER, UserRole.CLIENT])(
    "refuses a %s actor, even for their own id, before touching storage or the DB",
    async (role) => {
      const { deps, upload, updateProfile } = setup();
      await expect(
        run(PNG, deps, { userId: TARGET, role }, TARGET),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(upload).not.toHaveBeenCalled();
      expect(updateProfile).not.toHaveBeenCalled();
    },
  );

  it("refuses a non-lawyer target (client/admin) without storing anything", async () => {
    for (const targetRole of [UserRole.CLIENT, UserRole.ADMIN]) {
      const { deps, upload, updateProfile } = setup({ targetRole });
      await expect(run(PNG, deps)).rejects.toBeInstanceOf(ValidationError);
      expect(upload).not.toHaveBeenCalled();
      expect(updateProfile).not.toHaveBeenCalled();
    }
  });

  it("refuses a lawyer-role user that has no lawyer profile", async () => {
    const { deps, upload } = setup({ hasProfile: false });
    await expect(run(PNG, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses an unknown target user", async () => {
    const { deps, upload } = setup({ missingUser: true });
    await expect(run(PNG, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(upload).not.toHaveBeenCalled();
  });

  it("writes only to the targeted lawyer's storage owner and row, never the admin's", async () => {
    const { deps, upload, updateProfile } = setup();
    await run(PNG, deps);
    expect(upload.mock.calls[0]![0].ownerId).toBe(TARGET);
    expect(updateProfile.mock.calls.every((c) => c[0] === TARGET)).toBe(true);
  });

  it("rejects an oversized image before storage", async () => {
    const { deps, upload } = setup();
    const big = new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1);
    big.set(PNG);
    await expect(run(big, deps)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["a PDF labelled image/png", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
    ["an executable labelled image/png", new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x02])],
    ["empty bytes", new Uint8Array(0)],
  ])("rejects %s (the bytes decide, not the MIME header)", async (_n, body) => {
    const { deps, upload, updateProfile } = setup();
    await expect(run(body, deps)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    expect(upload).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("replaces an existing photo and deletes the old one only after the new one is persisted", async () => {
    const { deps, del, updateProfile } = setup({ image: `profile-photo/${TARGET}/old.img` });
    const order: string[] = [];
    updateProfile.mockImplementation(async (_id, patch) => {
      order.push("persist");
      return { id: TARGET, role: UserRole.LAWYER, image: patch.image ?? null } as never;
    });
    del.mockImplementation(async () => {
      order.push("delete-old");
    });
    await run(PNG, deps);
    expect(del).toHaveBeenCalledWith(`profile-photo/${TARGET}/old.img`);
    expect(order).toEqual(["persist", "delete-old"]);
  });

  it("keeps the existing photo when storage fails (no persist, no delete)", async () => {
    const { deps, upload, del, updateProfile } = setup({ image: `profile-photo/${TARGET}/old.img` });
    upload.mockRejectedValueOnce(new Error("S3 down"));
    await expect(run(PNG, deps)).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    expect(updateProfile).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps the existing photo when the DB write fails and removes the new orphan blob", async () => {
    const { deps, del, updateProfile } = setup({ image: `profile-photo/${TARGET}/old.img` });
    updateProfile.mockRejectedValueOnce(new Error("db down"));
    await expect(run(PNG, deps)).rejects.toMatchObject({ code: "DOCUMENT_SAVE_FAILED" });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(`profile-photo/${TARGET}/new-uuid.img`);
    expect(del).not.toHaveBeenCalledWith(`profile-photo/${TARGET}/old.img`);
  });

  it("never deletes an external (OAuth) avatar URL as if it were a stored object", async () => {
    const { deps, del } = setup({ image: "https://example.test/avatar.png" });
    await run(PNG, deps);
    expect(del).not.toHaveBeenCalled();
  });
});
