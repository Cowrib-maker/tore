import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/domain/errors/domain-error";
import { DocumentUploadError } from "@/domain/errors/document-upload-errors";

const requireActor = vi.fn();
const uploadMock = vi.fn();
const rate = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/application/common/require-actor", () => ({
  requireActor: (role: unknown) => requireActor(role),
}));
vi.mock("@/application/common/client-ip", () => ({ getClientIp: async () => "127.0.0.1" }));
vi.mock("@/application/use-cases/profiles/upload-profile-photo", async (orig) => ({
  ...(await orig<typeof import("@/application/use-cases/profiles/upload-profile-photo")>()),
  uploadProfilePhotoUseCase: (...args: unknown[]) => uploadMock(...args),
}));
vi.mock("@/infrastructure/repositories", () => ({
  auditLogRepository: {},
  userRepository: {},
}));
vi.mock("@/infrastructure/storage", () => ({ getFileStorage: () => ({}) }));
vi.mock("@/infrastructure/security/rate-limiter", () => ({
  consumeRateLimit: (...args: unknown[]) => rate(...args),
  PROFILE_WRITE_RATE_LIMIT: { limit: 10, windowMs: 1000 },
}));

import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";
import { POST } from "@/app/api/profile/photo/route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function request(file: File | null, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("photo", file);
  return new Request("http://localhost/api/profile/photo", {
    method: "POST",
    body: form,
    headers,
  });
}

describe("POST /api/profile/photo", () => {
  beforeEach(() => {
    requireActor.mockReset().mockResolvedValue({ userId: "u1", role: "LAWYER" });
    uploadMock.mockReset().mockResolvedValue({ id: "u1", image: "profile-photo/u1/a.png" });
    rate.mockReset().mockResolvedValue({ ok: true });
  });

  it("rejects an unauthenticated request before reading the body", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(new File([PNG], "a.png", { type: "image/png" })));
    expect(res.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a non-lawyer account", async () => {
    requireActor.mockRejectedValue(new ForbiddenError());
    const res = await POST(request(new File([PNG], "a.png", { type: "image/png" })));
    expect(res.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("acts only as the session actor; the request cannot name another user", async () => {
    const form = new FormData();
    form.append("photo", new File([PNG], "a.png", { type: "image/png" }));
    form.append("userId", "victim-user");
    const res = await POST(
      new Request("http://localhost/api/profile/photo", { method: "POST", body: form }),
    );
    expect(res.status).toBe(200);
    expect(uploadMock.mock.calls[0]![0]).toEqual({ userId: "u1", role: "LAWYER" });
    expect(JSON.stringify(uploadMock.mock.calls[0]![1])).not.toContain("victim");
    expect(requireActor).toHaveBeenCalledWith("LAWYER");
  });

  it("returns the owner's photo URL on success", async () => {
    const res = await POST(request(new File([PNG], "a.png", { type: "image/png" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.photoUrl).toContain("/api/files/profile-photo/u1/a.png");
  });

  it("rejects a declared over-limit body with JSON FILE_TOO_LARGE (413)", async () => {
    const res = await POST(
      request(new File([PNG], "a.png", { type: "image/png" }), {
        "content-length": String(PROFILE_PHOTO_MAX_BYTES + 1024 * 1024),
      }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const res = await POST(request(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  });

  it("passes typed use-case failures through with a client-safe message", async () => {
    uploadMock.mockRejectedValue(new DocumentUploadError("STORAGE_FAILED", "Хадгалж чадсангүй"));
    const res = await POST(request(new File([PNG], "a.png", { type: "image/png" })));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Хадгалж чадсангүй", code: "STORAGE_FAILED" });
  });

  it("hides internals on an unexpected error", async () => {
    uploadMock.mockRejectedValue(new Error("ECONNREFUSED /var/task/secret"));
    const res = await POST(request(new File([PNG], "a.png", { type: "image/png" })));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(JSON.parse(text)).toMatchObject({ code: "UPLOAD_FAILED" });
  });
});
