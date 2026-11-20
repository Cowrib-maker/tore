import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSpellInstallerSource,
  getSpellInstallerStorageKey,
  SPELL_ALLOW_PUBLIC_INSTALLER_ENV,
  SPELL_INSTALLER_STORAGE_KEY_ENV,
  SPELL_INSTALLER_URL_ENV,
} from "@/domain/spell/installer";
import { getSpellRelease } from "@/domain/spell/update";
import { isSensitiveStorageKey } from "@/infrastructure/storage/file-access";
import { checkSpellProductionConfig } from "@/infrastructure/spell/release-config";

const KEY = "spell-installer/1.0.0/TORE-Spell-Setup.exe";
const PUBLIC_URL = "https://downloads.example.test/TORE-Spell-Setup.exe";
const SHA = "a".repeat(64);

describe("installer source selection", () => {
  it("accepts only a safe key under spell-installer/", () => {
    expect(getSpellInstallerStorageKey({ [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY })).toBe(KEY);
    for (const bad of [
      "",
      "installers/x.exe",
      "spell-installer/",
      "spell-installer/../lawyer-credential/x.pdf",
      "spell-installer//x.exe",
      "spell-installer/a b.exe",
      "spell-installer/x.exe?versionId=1",
      "spell-installer\\x.exe",
      `spell-installer/${"a".repeat(200)}`,
    ]) {
      expect(getSpellInstallerStorageKey({ [SPELL_INSTALLER_STORAGE_KEY_ENV]: bad }), bad).toBeNull();
    }
  });

  it("prefers private storage over the public URL when both are configured and S3 is in use", () => {
    const both = { [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY, [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL };
    expect(getSpellInstallerSource(both, true)).toEqual({ kind: "storage", key: KEY });
  });

  it("FAILS CLOSED: a requested private key never degrades to the public URL (non-S3 storage, or a mistyped key)", () => {
    const withUrl = { [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL };
    // A local-disk key can never be served safely, and the public URL must not quietly take over.
    expect(getSpellInstallerSource({ ...withUrl, [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY }, false)).toBeNull();
    expect(getSpellInstallerSource({ [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY }, false)).toBeNull();
    // A typo in the key (wrong prefix, traversal, whitespace inside) is also "requested but invalid" → unavailable, not public.
    for (const typo of ["installer/x.exe", "spell-installer/../x", "spell-installer/a b.exe"]) {
      expect(getSpellInstallerSource({ ...withUrl, [SPELL_INSTALLER_STORAGE_KEY_ENV]: typo }, true), typo).toBeNull();
    }
    // Whitespace-only counts as "not requested".
    expect(getSpellInstallerSource({ ...withUrl, [SPELL_INSTALLER_STORAGE_KEY_ENV]: "   " }, true)).toEqual({ kind: "url", url: PUBLIC_URL });
    expect(getSpellInstallerSource({}, true)).toBeNull();
  });

  it("production honours a PUBLIC url only with the explicit opt-in; other environments keep it working", () => {
    const url = { [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL };
    expect(getSpellInstallerSource({ ...url, NODE_ENV: "production" }, true)).toBeNull();
    expect(getSpellInstallerSource({ ...url, NODE_ENV: "production", [SPELL_ALLOW_PUBLIC_INSTALLER_ENV]: "0" }, true)).toBeNull();
    expect(getSpellInstallerSource({ ...url, NODE_ENV: "production", [SPELL_ALLOW_PUBLIC_INSTALLER_ENV]: "1" }, true)).toEqual({ kind: "url", url: PUBLIC_URL });
    expect(getSpellInstallerSource({ ...url, NODE_ENV: "development" }, true)).toEqual({ kind: "url", url: PUBLIC_URL });
    expect(getSpellInstallerSource({ ...url, NODE_ENV: "test" }, true)).toEqual({ kind: "url", url: PUBLIC_URL });
  });

  it("installer objects are classed as sensitive (signed, attachment, never a public CDN URL)", () => {
    expect(isSensitiveStorageKey(KEY)).toBe(true);
  });
});

describe("release metadata for the signed update notice", () => {
  const base = { SPELL_RELEASE_VERSION: "1.0.0", SPELL_WINDOWS_INSTALLER_SHA256: SHA };

  it("with private delivery the notice points at the licence page, not at a file", () => {
    const rel = getSpellRelease({ ...base, [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY, NEXT_PUBLIC_APP_URL: "https://tore.example/" });
    expect(rel?.url).toBe("https://tore.example/spell/license");
    expect(rel?.sha256).toBe(SHA);
  });

  it("still needs a version, a hash and a location: nothing is guessed", () => {
    expect(getSpellRelease({ ...base, [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY })).toBeNull(); // no app origin
    expect(getSpellRelease({ SPELL_RELEASE_VERSION: "1.0.0", [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY, NEXT_PUBLIC_APP_URL: "https://t.example" })).toBeNull(); // no hash
    expect(getSpellRelease({ ...base })).toBeNull(); // no location
    expect(getSpellRelease({ ...base, [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL })?.url).toBe(PUBLIC_URL);
  });
});

describe("production config checker reports the delivery mode honestly", () => {
  const checks = (env: Record<string, string>) =>
    Object.fromEntries(checkSpellProductionConfig(env as never).map((c) => [c.id, c]));

  it("a public installer URL is a BLOCKER in production unless explicitly accepted, then a WARN", () => {
    const base = { SPELL_RELEASE_VERSION: "1.0.0", SPELL_WINDOWS_INSTALLER_SHA256: SHA, [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL };
    const refused = checks(base).INSTALLER_DELIVERY;
    expect(refused?.status).toBe("INVALID");
    expect(refused?.blocker).toBe(true);
    expect(refused?.message).toMatch(/ignored in production unless TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1/);
    const accepted = checks({ ...base, TORE_ALLOW_PUBLIC_SPELL_INSTALLER: "1" }).INSTALLER_DELIVERY;
    expect(accepted?.status).toBe("WARN");
    expect(accepted?.blocker).toBe(false);
    expect(accepted?.message).toMatch(/anyone who learns the URL/);
  });

  it("a private key that is malformed is a blocker, and the public URL does not rescue it", () => {
    const c = checks({
      SPELL_RELEASE_VERSION: "1.0.0",
      SPELL_WINDOWS_INSTALLER_SHA256: SHA,
      [SPELL_INSTALLER_STORAGE_KEY_ENV]: "installers/typo.exe",
      [SPELL_INSTALLER_URL_ENV]: PUBLIC_URL,
      TORE_ALLOW_PUBLIC_SPELL_INSTALLER: "1",
      FILE_STORAGE: "s3",
    }).INSTALLER_DELIVERY;
    expect(c?.status).toBe("INVALID");
    expect(c?.blocker).toBe(true);
    expect(c?.message).toMatch(/never falls back to the public URL/);
  });

  it("accepts private delivery on S3 and rejects it on local storage", () => {
    const common = { SPELL_RELEASE_VERSION: "1.0.0", SPELL_WINDOWS_INSTALLER_SHA256: SHA, [SPELL_INSTALLER_STORAGE_KEY_ENV]: KEY, NEXT_PUBLIC_APP_URL: "https://tore.example" };
    expect(checks({ ...common, FILE_STORAGE: "s3" }).INSTALLER_DELIVERY?.status).toBe("OK");
    const local = checks({ ...common, FILE_STORAGE: "local" }).INSTALLER_DELIVERY;
    expect(local?.status).toBe("INVALID");
    expect(local?.blocker).toBe(true);
  });
});

describe("GET /api/spell/download", () => {
  const getUrl = vi.fn();
  const listByOwner = vi.fn();
  const requireActor = vi.fn();
  let fileStorage: "s3" | "local";

  const day = 24 * 60 * 60 * 1000;
  const live = { status: "ACTIVE", redeemBy: new Date(Date.now() + day), startsAt: new Date(Date.now() - day), expiresAt: new Date(Date.now() + 30 * day) };
  const expiredButStoredActive = { ...live, expiresAt: new Date(Date.now() - 1000) };
  const revoked = { ...live, status: "REVOKED" };

  beforeEach(() => {
    vi.resetModules();
    getUrl.mockReset();
    listByOwner.mockReset();
    requireActor.mockReset();
    fileStorage = "s3";
    requireActor.mockResolvedValue({ userId: "owner-1", role: "CLIENT" });
    vi.doMock("@/application/common/require-actor", () => ({ requireActor }));
    vi.doMock("@/infrastructure/spell/spell-runtime", () => ({
      getSpellRuntime: () => ({ deps: { repos: { licenseRepository: { listByOwner } } } }),
    }));
    vi.doMock("@/lib/env", () => ({ env: { get FILE_STORAGE() { return fileStorage; } } }));
    vi.doMock("@/infrastructure/storage", () => ({ getFileStorage: () => ({ getUrl }) }));
  });

  afterEach(() => vi.unstubAllEnvs());

  async function call() {
    const { GET } = await import("@/app/api/spell/download/route");
    return GET();
  }

  it("without a session: refused, nothing issued", async () => {
    const { UnauthorizedError } = await import("@/domain/errors/domain-error");
    requireActor.mockRejectedValue(new UnauthorizedError());
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    const res = await call();
    expect(res.status).toBe(401);
    expect(getUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["no licence at all", [] as unknown[]],
    ["an expired licence whose stored status still reads ACTIVE", [expiredButStoredActive]],
    ["a revoked licence", [revoked]],
  ])("%s → 403, and no signed URL is ever created", async (_name, licences) => {
    listByOwner.mockResolvedValue(licences);
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    vi.stubEnv(SPELL_INSTALLER_URL_ENV, PUBLIC_URL);
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("location")).toBeNull();
    expect(JSON.stringify(await res.json())).not.toMatch(/spell-installer|downloads\.example/);
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("a live licence + private storage → 302 to a SHORT-LIVED signed URL for exactly the configured key", async () => {
    listByOwner.mockResolvedValue([live]);
    getUrl.mockResolvedValue("https://bucket.example/signed?X-Amz-Expires=60");
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://bucket.example/signed?X-Amz-Expires=60");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(getUrl).toHaveBeenCalledWith(KEY, { expiresInSeconds: 60 });
  });

  it("private storage wins over a public URL when both are configured", async () => {
    listByOwner.mockResolvedValue([live]);
    getUrl.mockResolvedValue("https://bucket.example/signed");
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    vi.stubEnv(SPELL_INSTALLER_URL_ENV, PUBLIC_URL);
    expect((await call()).headers.get("location")).toBe("https://bucket.example/signed");
  });

  it("a live licence + public URL only → redirects to that URL outside production", async () => {
    listByOwner.mockResolvedValue([live]);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(SPELL_INSTALLER_URL_ENV, PUBLIC_URL);
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(PUBLIC_URL);
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("PRODUCTION: a public URL is NOT served without the explicit opt-in, and is with it", async () => {
    listByOwner.mockResolvedValue([live]);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SPELL_INSTALLER_URL_ENV, PUBLIC_URL);
    const refused = await call();
    expect(refused.status).toBe(404);
    expect(refused.headers.get("location")).toBeNull();
    vi.stubEnv(SPELL_ALLOW_PUBLIC_INSTALLER_ENV, "1");
    vi.resetModules();
    const accepted = await call();
    expect(accepted.status).toBe(302);
    expect(accepted.headers.get("location")).toBe(PUBLIC_URL);
  });

  it("PRODUCTION: a private key on non-S3 storage is unavailable — it must not fall back to the public URL even when that is allowed", async () => {
    fileStorage = "local";
    listByOwner.mockResolvedValue([live]);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SPELL_ALLOW_PUBLIC_INSTALLER_ENV, "1");
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    vi.stubEnv(SPELL_INSTALLER_URL_ENV, PUBLIC_URL);
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("a key configured on LOCAL storage is ignored: 404, never a local-path or /api/files redirect", async () => {
    fileStorage = "local";
    listByOwner.mockResolvedValue([live]);
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("INSTALLER_NOT_AVAILABLE");
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("nothing configured → 404 INSTALLER_NOT_AVAILABLE", async () => {
    listByOwner.mockResolvedValue([live]);
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("INSTALLER_NOT_AVAILABLE");
  });

  it("a storage failure is a retryable 503 that reveals neither the key nor the error", async () => {
    listByOwner.mockResolvedValue([live]);
    getUrl.mockRejectedValue(new Error(`AccessDenied for ${KEY} with secret-credential`));
    vi.stubEnv(SPELL_INSTALLER_STORAGE_KEY_ENV, KEY);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call();
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(503);
    expect(text).toContain("DOWNLOAD_UNAVAILABLE");
    expect(text).not.toMatch(/AccessDenied|secret-credential|spell-installer/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/AccessDenied|secret-credential|spell-installer/);
    log.mockRestore();
  });
});
