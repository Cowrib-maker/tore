import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KnowledgeDocumentKind, LegalInfoKnowledgeParser } from "@/engine/knowledge";
import {
  STAGING_ARCHIVE_S3_PREFIX,
  STAGING_CANARY_LAW_IDS,
  STAGING_NEON_HOST,
  StagingCanaryGuardError,
  assertStagingCanaryEnv,
  evaluateStagingCanaryArticles,
  isStagingCanaryLawId,
  loadStagingEnvFile,
  parseStagingLawIds,
} from "../../scripts/lib/legalinfo-staging-canary";

const STAGING_DATABASE_URL = `postgresql://u:p@${STAGING_NEON_HOST}/neondb`;
const UNKNOWN_APP_DATABASE_URL =
  "postgresql://u:p@ep-morning-recipe-azj1asek.c-3.ap-southeast-1.aws.neon.tech/neondb";

function stagingValues(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DATABASE_URL: STAGING_DATABASE_URL,
    ARCHIVE_STORAGE: "s3",
    ARCHIVE_S3_PREFIX: STAGING_ARCHIVE_S3_PREFIX,
    S3_BUCKET: "tore-legal-archive",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
    S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    S3_FORCE_PATH_STYLE: "true",
    ...overrides,
  };
}

describe("staging LegalInfo canary guards", () => {
  it("accepts the dedicated staging Neon host and legal-archive-staging prefix", () => {
    const env = assertStagingCanaryEnv(stagingValues());
    expect(env.DATABASE_URL).toContain(STAGING_NEON_HOST);
    expect(env.ARCHIVE_S3_PREFIX).toBe("legal-archive-staging");
  });

  it("rejects the production/unknown application DATABASE_URL", () => {
    expect(() =>
      assertStagingCanaryEnv(
        stagingValues({ DATABASE_URL: UNKNOWN_APP_DATABASE_URL }),
      ),
    ).toThrow(StagingCanaryGuardError);
    expect(() =>
      assertStagingCanaryEnv(
        stagingValues({ DATABASE_URL: UNKNOWN_APP_DATABASE_URL }),
      ),
    ).toThrow(/ep-morning-recipe/);
  });

  it("rejects a non-staging Neon host even without the morning-recipe token", () => {
    expect(() =>
      assertStagingCanaryEnv(
        stagingValues({
          DATABASE_URL: "postgresql://u:p@ep-other-host.aws.neon.tech/neondb",
        }),
      ),
    ).toThrow(/must be exactly/);
  });

  it("rejects the production archive prefix legal-archive", () => {
    expect(() =>
      assertStagingCanaryEnv(stagingValues({ ARCHIVE_S3_PREFIX: "legal-archive" })),
    ).toThrow(/legal-archive-staging/);
  });

  it("rejects an empty archive prefix (would default to production)", () => {
    expect(() =>
      assertStagingCanaryEnv(stagingValues({ ARCHIVE_S3_PREFIX: "" })),
    ).toThrow(StagingCanaryGuardError);
  });

  it("loads .env.staging only and refuses to fall back to .env", () => {
    const root = mkdtempSync(join(tmpdir(), "tore-staging-canary-"));
    try {
      expect(() => loadStagingEnvFile(root)).toThrow(/Missing \.env\.staging/);
      writeFileSync(
        join(root, ".env"),
        `DATABASE_URL=${UNKNOWN_APP_DATABASE_URL}\nARCHIVE_S3_PREFIX=legal-archive\n`,
        "utf8",
      );
      expect(() => loadStagingEnvFile(root)).toThrow(/Missing \.env\.staging/);
      writeFileSync(
        join(root, ".env.staging"),
        `DATABASE_URL="${STAGING_DATABASE_URL}"\nARCHIVE_S3_PREFIX=legal-archive-staging\n`,
        "utf8",
      );
      const loaded = loadStagingEnvFile(root);
      expect(loaded.DATABASE_URL).toContain(STAGING_NEON_HOST);
      expect(loaded.ARCHIVE_S3_PREFIX).toBe("legal-archive-staging");
      expect(loaded.DATABASE_URL).not.toContain("ep-morning-recipe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("staging LegalInfo explicit lawId selection", () => {
  it("accepts the original two-law selection 367,11634 in operator order", () => {
    expect(parseStagingLawIds(["--law-ids=367,11634"])).toEqual([
      "367",
      "11634",
    ]);
    expect(parseStagingLawIds(["--law-ids", "11634,367"])).toEqual([
      "11634",
      "367",
    ]);
    expect(STAGING_CANARY_LAW_IDS).toEqual(["367", "11634"]);
    expect(isStagingCanaryLawId("367")).toBe(true);
    expect(isStagingCanaryLawId("11634")).toBe(true);
    expect(isStagingCanaryLawId("439")).toBe(false);
  });

  it("accepts an explicit reviewed list without injecting catalog IDs", () => {
    expect(parseStagingLawIds(["--law-ids=367,439,123,400"])).toEqual([
      "367",
      "439",
      "123",
      "400",
    ]);
    expect(parseStagingLawIds(["--law-ids=367,439,123,400"])).not.toContain(
      "112",
    );
    expect(parseStagingLawIds(["--law-ids=367,439,123,400"])).not.toContain(
      "11634",
    );
  });

  it("rejects missing, empty, duplicate, and non-numeric law IDs", () => {
    expect(() => parseStagingLawIds([])).toThrow(/Missing --law-ids/);
    expect(() => parseStagingLawIds(["--law-ids="])).toThrow(/Empty --law-ids/);
    expect(() => parseStagingLawIds(["--law-ids=367,367"])).toThrow(/Duplicate/);
    expect(() => parseStagingLawIds(["--law-ids=367,abc"])).toThrow(/numeric/);
    expect(() => parseStagingLawIds(["--law-ids=0367"])).toThrow(/numeric/);
    expect(() => parseStagingLawIds(["--law-ids=PENDING"])).toThrow(/numeric/);
  });
});

describe("staging LegalInfo canary 11634 dotted article assertion", () => {
  it("accepts 17.1 and 17.2 and rejects invented integer 17", async () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/legalinfo-11634-dotted-articles.html"),
      "utf8",
    );
    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(html),
      fetchedAt: new Date(),
    });
    const check = evaluateStagingCanaryArticles("11634", parsed.articles);
    expect(check.ok).toBe(true);
    expect(check.hasArticle171).toBe(true);
    expect(check.hasArticle172).toBe(true);
    expect(check.hasIntegerArticle17).toBe(false);

    expect(
      evaluateStagingCanaryArticles("11634", [
        { articleNumber: "17.1" },
        { articleNumber: "17" },
        { articleNumber: "17.2" },
      ]).ok,
    ).toBe(false);
  });

  it("requires Constitution 367 to preserve articles 1 and 12", () => {
    expect(
      evaluateStagingCanaryArticles("367", [
        { articleNumber: "1" },
        { articleNumber: "12" },
      ]).ok,
    ).toBe(true);
    expect(
      evaluateStagingCanaryArticles("367", [{ articleNumber: "1" }]).reason,
    ).toMatch(/article 1 and article 12/);
  });

  it("accepts other explicit lawIds when article count is greater than 0", () => {
    expect(
      evaluateStagingCanaryArticles("439", [{ articleNumber: "1" }]).ok,
    ).toBe(true);
    expect(
      evaluateStagingCanaryArticles("123", []).ok,
    ).toBe(false);
  });
});

describe("staging LegalInfo canary does not mutate the discovery manifest", () => {
  it("does not import or write the shared discovery manifest", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/ingest-legalinfo-staging-canary.ts"),
      "utf8",
    );
    const lib = readFileSync(
      join(process.cwd(), "scripts/lib/legalinfo-staging-canary.ts"),
      "utf8",
    );
    expect(source).not.toContain("legalinfo-discovery-manifest.json");
    expect(lib).not.toContain("legalinfo-discovery-manifest.json");
    expect(source).not.toContain("FileLegalInfoManifestStore");
    expect(source).toContain("discovery manifest: not used (no mutation)");
  });

  it("does not rewrite a caller-supplied discovery manifest file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tore-manifest-guard-"));
    try {
      const manifestPath = join(dir, "legalinfo-discovery-manifest.json");
      const original = JSON.stringify({
        documents: [{ lawId: "367", status: "SUCCESS" }],
      });
      writeFileSync(manifestPath, original, "utf8");
      expect(
        readFileSync(manifestPath, "utf8"),
      ).toBe(original);
      expect(parseStagingLawIds(["--law-ids=367,11634"])).toEqual([
        "367",
        "11634",
      ]);
      expect(readFileSync(manifestPath, "utf8")).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
