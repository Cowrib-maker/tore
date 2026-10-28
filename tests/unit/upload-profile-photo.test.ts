import { describe, expect, it, vi } from "vitest";

import { uploadProfilePhotoUseCase } from "@/application/use-cases/profiles/upload-profile-photo";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

const lawyer = { userId: "u-lawyer", role: UserRole.LAWYER };

function setup(options: { image?: string | null } = {}) {
  const user = (image: string | null) => ({ id: "u-lawyer", image }) as never;
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
  const deps = {
    userRepository: {
      findById: vi.fn(async () => user(options.image ?? null)),
      updateProfile,
    },
    auditLogRepository: { create: vi.fn(async () => ({})) },
    fileStorage: { upload, delete: del },
  } as never;
  return { deps, upload, del, updateProfile };
}

const file = (body: Uint8Array, contentType = "image/png") => ({
  fileName: "me.png",
  contentType,
  body,
});

describe("uploadProfilePhotoUseCase", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
  ])("lets a lawyer set their own %s photo", async (_n, body, mime) => {
    const { deps, upload, updateProfile } = setup();
    await uploadProfilePhotoUseCase(lawyer, file(body, "application/octet-stream"), deps);
    // The stored type comes from the bytes, not the client header.
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "profile-photo", ownerId: "u-lawyer", contentType: mime }),
    );
    expect(updateProfile).toHaveBeenCalledWith("u-lawyer", {
      image: "profile-photo/u-lawyer/new-uuid.img",
    });
  });

  it.each([UserRole.CLIENT, UserRole.ADMIN])(
    "refuses a %s actor with no target lawyer, before touching storage or the user row",
    async (role) => {
      const { deps, upload, updateProfile } = setup();
      await expect(
        uploadProfilePhotoUseCase({ userId: "u-x", role }, file(PNG), deps),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(upload).not.toHaveBeenCalled();
      expect(updateProfile).not.toHaveBeenCalled();
    },
  );

  it("lawyer A cannot change lawyer B's photo (explicit target is forbidden)", async () => {
    const { deps, upload, updateProfile } = setup();
    await expect(
      uploadProfilePhotoUseCase(lawyer, file(PNG), deps, undefined, "u-other-lawyer"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(upload).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("a lawyer naming themselves explicitly is fine", async () => {
    const { deps, updateProfile } = setup();
    await uploadProfilePhotoUseCase(lawyer, file(PNG), deps, undefined, "u-lawyer");
    expect(updateProfile).toHaveBeenCalledWith("u-lawyer", expect.anything());
  });

  it("an ADMIN may manage a LAWYER account's photo; the owner is the lawyer, the audit actor is the admin", async () => {
    const { deps, upload, updateProfile } = setup();
    (deps as { userRepository: { findById: ReturnType<typeof vi.fn> } }).userRepository.findById = vi.fn(async (id: string) => ({ id, role: UserRole.LAWYER, image: null })) as never;
    await uploadProfilePhotoUseCase({ userId: "admin-1", role: UserRole.ADMIN }, file(PNG), deps, "1.2.3.4", "u-lawyer");
    expect(upload.mock.calls[0]![0].ownerId).toBe("u-lawyer");
    expect(updateProfile.mock.calls[0]![0]).toBe("u-lawyer");
    const audit = (deps as { auditLogRepository: { create: ReturnType<typeof vi.fn> } }).auditLogRepository.create.mock.calls[0]![0];
    expect(audit).toMatchObject({ actorUserId: "admin-1", entityId: "u-lawyer", metadata: { onBehalfOfAdmin: true } });
  });

  it("an ADMIN cannot use this to write a non-lawyer or missing account (indistinguishable NotFound)", async () => {
    for (const found of [{ id: "c1", role: UserRole.CLIENT, image: null }, null]) {
      const { deps, upload } = setup();
      (deps as { userRepository: { findById: ReturnType<typeof vi.fn> } }).userRepository.findById = vi.fn(async () => found) as never;
      await expect(
        uploadProfilePhotoUseCase({ userId: "admin-1", role: UserRole.ADMIN }, file(PNG), deps, undefined, "c1"),
      ).rejects.toMatchObject({ name: expect.stringMatching(/NotFound/i) });
      expect(upload).not.toHaveBeenCalled();
    }
  });

  it("only ever writes the acting user's own row and storage owner", async () => {
    const { deps, upload, updateProfile } = setup();
    await uploadProfilePhotoUseCase({ userId: "u-lawyer", role: UserRole.LAWYER }, file(PNG), deps);
    expect(upload.mock.calls[0]![0].ownerId).toBe("u-lawyer");
    expect(updateProfile.mock.calls.every((c) => c[0] === "u-lawyer")).toBe(true);
  });

  it("rejects an oversized image before storage", async () => {
    const { deps, upload } = setup();
    const big = new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1);
    big.set(PNG);
    await expect(uploadProfilePhotoUseCase(lawyer, file(big), deps)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["a PDF labelled image/png", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
    ["an executable labelled image/png", new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x02])],
    ["empty bytes", new Uint8Array(0)],
  ])("rejects %s (the bytes decide, not the MIME header)", async (_n, body) => {
    const { deps, upload, updateProfile } = setup();
    await expect(uploadProfilePhotoUseCase(lawyer, file(body), deps)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
    expect(upload).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("replaces an existing photo and deletes the old one only after the new one is persisted", async () => {
    const { deps, del, updateProfile } = setup({ image: "profile-photo/u-lawyer/old.img" });
    const order: string[] = [];
    updateProfile.mockImplementation(async (_id, patch) => {
      order.push("persist");
      return { id: "u-lawyer", image: patch.image ?? null } as never;
    });
    del.mockImplementation(async () => {
      order.push("delete-old");
    });
    await uploadProfilePhotoUseCase(lawyer, file(PNG), deps);
    expect(del).toHaveBeenCalledWith("profile-photo/u-lawyer/old.img");
    expect(order).toEqual(["persist", "delete-old"]);
  });

  it("keeps the existing photo when storage fails (no persist, no delete)", async () => {
    const { deps, upload, del, updateProfile } = setup({ image: "profile-photo/u-lawyer/old.img" });
    upload.mockRejectedValueOnce(new Error("S3 down"));
    await expect(uploadProfilePhotoUseCase(lawyer, file(PNG), deps)).rejects.toMatchObject({
      code: "STORAGE_FAILED",
    });
    expect(updateProfile).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps the existing photo when the DB write fails and removes the new orphan blob", async () => {
    const { deps, del, updateProfile } = setup({ image: "profile-photo/u-lawyer/old.img" });
    updateProfile.mockRejectedValueOnce(new Error("db down"));
    await expect(uploadProfilePhotoUseCase(lawyer, file(PNG), deps)).rejects.toMatchObject({
      code: "DOCUMENT_SAVE_FAILED",
    });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("profile-photo/u-lawyer/new-uuid.img");
    expect(del).not.toHaveBeenCalledWith("profile-photo/u-lawyer/old.img");
  });

  it("does not delete an external (OAuth) avatar URL when replacing", async () => {
    const { deps, del } = setup({ image: "https://example.test/avatar.png" });
    await uploadProfilePhotoUseCase(lawyer, file(PNG), deps);
    expect(del).not.toHaveBeenCalled();
  });
});
