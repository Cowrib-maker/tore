import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

describe("route authorization is wired where the data is", () => {
  it("admin feedback routes require the ADMIN role; the review route also checks the origin", () => {
    for (const f of ["src/app/api/spell/admin/feedback/route.ts", "src/app/api/spell/admin/feedback/review/route.ts"]) expect(read(f), f).toMatch(/requireActor\(UserRole\.ADMIN\)/);
    expect(read("src/app/api/spell/admin/feedback/review/route.ts")).toMatch(/assertSameOrigin\(request\)/);
  });
  it("device feedback routes accept only signed requests from a known installation and a strict body", () => {
    for (const f of ["src/app/api/spell/v1/feedback/route.ts", "src/app/api/spell/v1/contributions/route.ts"]) {
      const t = read(f);
      expect(t, f).toMatch(/authenticateSignedRequest/);
      expect(t, f).toMatch(/readBoundedBody/);
      expect(t, f).toMatch(/throttle\(/);
      expect(t, f).not.toMatch(/requireActor/); // a device is not a browser session
    }
    expect(read("src/app/api/spell/v1/feedback/route.ts")).toMatch(/feedbackRequestSchema/);
  });
  it("the admin feedback page is reachable only by an admin", () => {
    const t = read("src/app/admin/spell/feedback/page.tsx");
    expect(t).toMatch(/role !== UserRole\.ADMIN/);
    expect(t).toMatch(/redirect\(/);
  });
  it("a user has no route that edits a licence or a feedback status (no PUT/PATCH/DELETE under the user licence and feedback APIs)", () => {
    for (const f of walk("src/app/api/spell").filter((x) => /route\.ts$/.test(x) && !x.includes("/admin/"))) {
      expect(read(f), f).not.toMatch(/export async function (PUT|PATCH|DELETE)\b/);
    }
  });
  it("the licence-revealing and download routes keep their owner/licence gates", () => {
    expect(read("src/app/api/spell/licenses/[licenseId]/code/route.ts")).toMatch(/revealLicenseCode/);
    expect(read("src/app/api/spell/download/route.ts")).toMatch(/requireActor\(\)/);
  });
});

describe("no server secret or private material in the desktop app source", () => {
  const FORBIDDEN = /SPELL_SIGNING_KEYS|SPELL_CODE_HMAC|SPELL_CODE_ENC|QPAY_[A-Z_]*(SECRET|PASSWORD)|DATABASE_URL|AUTH_SECRET|JWT_SECRET|BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY|CSC_KEY_PASSWORD|CSC_LINK/;
  it("desktop/app and desktop/core contain none of them", () => {
    for (const f of [...walk("desktop/app"), ...walk("desktop/core")].filter((x) => /\.(ts|js|html|css|json)$/.test(x))) expect(read(f), f).not.toMatch(FORBIDDEN);
  });
  it("the preload exposes a fixed set of narrow functions, never ipcRenderer or Node", () => {
    const t = read("desktop/app/preload.ts");
    expect(t).toMatch(/contextBridge\.exposeInMainWorld\("spell"/);
    expect(t).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/);
    expect(t).not.toMatch(/require\(|process\.env|fs\./);
  });
  it("the renderer can only open fixed pages of the configured origin, never a URL it supplies", () => {
    const main = read("desktop/app/main.ts");
    expect(main).toMatch(/const PAGES: Record<string, string>/);
    expect(main).toMatch(/new URL\(p, API_BASE\)/);
    expect(read("desktop/app/renderer/renderer.js")).not.toMatch(/openExternal|window\.open|location\s*=/);
  });
});

describe("the feedback table cannot be written by a user-chosen status", () => {
  it("the Prisma repository always inserts PENDING and the domain create type has no status", () => {
    expect(read("src/infrastructure/repositories/prisma-spell-feedback-repository.ts")).toMatch(/status: "PENDING"/);
    expect(read("src/domain/repositories/spell-feedback-repository.ts")).toMatch(/Omit<SpellFeedback, "id" \| "status"/);
  });
  it("the migration is additive: new enums and one new table only", () => {
    const dir = fs.readdirSync(path.join(ROOT, "prisma/migrations")).find((d) => d.endsWith("_spell_feedback"))!;
    const sql = read(`prisma/migrations/${dir}/migration.sql`).replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b\s+\S+\s+SET|\bALTER TABLE\b/i);
    expect([...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1])).toEqual(["spell_feedback"]);
  });
});

describe("user data lives outside the application files, so an update cannot touch it", () => {
  const main = read("desktop/app/main.ts");
  it("every persistent file (licence + device key, dictionary, feedback outbox) is stored under the OS user-data directory", () => {
    expect(main).toMatch(/const dir = app\.getPath\("userData"\)/);
    for (const name of ["license.json", "dictionary.json", "feedback-outbox.json"]) expect(main.includes(`path.join(dir, "${name}")`), name).toBe(true);
  });
  it("the app never writes beside its own binaries (no writes relative to __dirname, app path or resources)", () => {
    expect(main).not.toMatch(/writeFile(Sync)?\([^)]*(__dirname|getAppPath|resourcesPath)/);
    expect(main).not.toMatch(/\.(write|clear)\([^)]*(__dirname|getAppPath|resourcesPath)/);
  });
  it("the licence client keeps one stable random device identity (not hardware fingerprints)", () => {
    const t = read("desktop/core/license-client.ts");
    expect(t).toMatch(/generateKeyPairSync\("ed25519"\)/);
    expect(t).not.toMatch(/os\.(hostname|networkInterfaces|cpus|userInfo)|machine-id|wmic|getmac/i);
  });
});
