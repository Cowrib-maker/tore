import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors/domain-error";
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
  lawyerProfileRepository: {},
  userRepository: {},
}));
vi.mock("@/infrastructure/storage", () => ({ getFileStorage: () => ({}) }));
vi.mock("@/infrastructure/security/rate-limiter", () => ({
  consumeRateLimit: (...args: unknown[]) => rate(...args),
  PROFILE_WRITE_RATE_LIMIT: { limit: 10, windowMs: 1000 },
}));

import { POST } from "@/app/api/admin/lawyers/[userId]/photo/route";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ctx = (userId = "lawyer-1") => ({ params: Promise.resolve({ userId }) });

function request(file: File | null, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("photo", file);
  return new Request("http://localhost/api/admin/lawyers/lawyer-1/photo", {
    method: "POST",
    body: form,
    headers,
  });
}
const png = () => new File([PNG], "a.png", { type: "image/png" });

describe("POST /api/admin/lawyers/[userId]/photo", () => {
  beforeEach(() => {
    requireActor.mockReset().mockResolvedValue({ userId: "admin-1", role: "ADMIN" });
    uploadMock
      .mockReset()
      .mockResolvedValue({ id: "lawyer-1", image: "profile-photo/lawyer-1/a.png" });
    rate.mockReset().mockResolvedValue({ ok: true });
  });

  it("requires the ADMIN role from the session (not from the request)", async () => {
    await POST(request(png()), ctx());
    expect(requireActor).toHaveBeenCalledWith("ADMIN");
  });

  it("returns 401 for an unauthenticated caller before reading the body", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const res = await POST(request(png()), ctx());
    expect(res.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a lawyer or any non-admin", async () => {
    requireActor.mockRejectedValue(new ForbiddenError());
    const res = await POST(request(png()), ctx());
    expect(res.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads for the lawyer named in the URL as the session admin, ignoring any body userId", async () => {
    const form = new FormData();
    form.append("photo", png());
    form.append("userId", "someone-else");
    form.append("role", "ADMIN");
    const res = await POST(
      new Request("http://localhost/x", { method: "POST", body: form }),
      ctx("lawyer-7"),
    );
    expect(res.status).toBe(200);
    expect(uploadMock.mock.calls[0]![0]).toEqual({ userId: "admin-1", role: "ADMIN" });
    expect(uploadMock.mock.calls[0]![1]).toBe("lawyer-7");
    expect(JSON.stringify(uploadMock.mock.calls[0]![2])).not.toContain("someone-else");
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.photoUrl).toContain("/api/files/profile-photo/lawyer-1/a.png");
  });

  it("maps a non-lawyer target to 400 and an unknown target to 404", async () => {
    uploadMock.mockRejectedValueOnce(new ValidationError("only lawyers"));
    expect((await POST(request(png()), ctx("client-1"))).status).toBe(400);
    uploadMock.mockRejectedValueOnce(new NotFoundError("User"));
    expect((await POST(request(png()), ctx("ghost"))).status).toBe(404);
  });

  it("rejects a declared over-limit body with JSON FILE_TOO_LARGE (413)", async () => {
    const res = await POST(
      request(png(), { "content-length": String(PROFILE_PHOTO_MAX_BYTES + 1024 * 1024) }),
      ctx(),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const res = await POST(request(null), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  });

  it("passes typed use-case failures through with a client-safe message", async () => {
    uploadMock.mockRejectedValue(new DocumentUploadError("STORAGE_FAILED", "Хадгалж чадсангүй"));
    const res = await POST(request(png()), ctx());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Хадгалж чадсангүй", code: "STORAGE_FAILED" });
  });

  it("hides internals on an unexpected error", async () => {
    uploadMock.mockRejectedValue(new Error("ECONNREFUSED /var/task/secret"));
    const res = await POST(request(png()), ctx());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(JSON.parse(text)).toMatchObject({ code: "UPLOAD_FAILED" });
  });
});

describe("lawyer self-service photo upload is gone", () => {
  const root = process.cwd();

  it("has no self-service API route", () => {
    expect(existsSync(path.join(root, "src/app/api/profile/photo/route.ts"))).toBe(false);
  });

  it("the lawyer profile page renders a read-only photo and no upload control", () => {
    const page = readFileSync(path.join(root, "src/app/lawyer/profile/page.tsx"), "utf8");
    expect(page).toContain("ProfilePhotoDisplay");
    expect(page).not.toContain("ProfilePhotoUploadForm");
    expect(page).not.toContain("/api/profile/photo");
    expect(page).not.toContain('type="file"');
  });

  it("the read-only display contains no input, form, fetch or client code", () => {
    const display = readFileSync(
      path.join(root, "src/components/profiles/profile-photo-display.tsx"),
      "utf8",
    );
    expect(display).not.toMatch(/<input|<form|fetch\(|"use client"/);
  });

  it("the admin lawyers page wires the upload control to the admin route", () => {
    const admin = readFileSync(path.join(root, "src/app/admin/lawyers/page.tsx"), "utf8");
    expect(admin).toContain("/api/admin/lawyers/");
    expect(admin).toContain("ProfilePhotoUploadForm");
  });
});
