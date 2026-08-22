import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("LegalInfo ingest command roles", () => {
  const root = process.cwd();

  it("keeps batch-10 as a local parser test without Prisma persistence", () => {
    const source = readFileSync(
      join(root, "scripts/ingest-legalinfo-batch-10.ts"),
      "utf8",
    );
    expect(source).toMatch(/local parser test/i);
    expect(source).toContain("archiveRootDir");
    expect(source).not.toContain("PrismaKnowledgeRepository");
    expect(source).not.toContain("createLegalArchiveStack");
  });

  it("requires staging canary to use Prisma archive + knowledge and S3/R2", () => {
    const source = readFileSync(
      join(root, "scripts/ingest-legalinfo-cloud-canary-10.ts"),
      "utf8",
    );
    expect(source).toMatch(/staging canary/i);
    expect(source).toContain("PrismaKnowledgeRepository");
    expect(source).toContain("createLegalArchiveStack");
    expect(source).toContain("usePostgresMetadata: true");
    expect(source).toContain("ARCHIVE_S3_PREFIX");
    expect(source).toMatch(/Never use production credentials in tests/);
  });

  it("labels cloud ingest as production remaining-corpus and does not auto-run it", () => {
    const source = readFileSync(
      join(root, "scripts/ingest-legalinfo-cloud.ts"),
      "utf8",
    );
    expect(source).toMatch(/production remaining-corpus|PRODUCTION full remaining-corpus/i);
    expect(source).toContain("PrismaKnowledgeRepository");
    expect(source).toMatch(/Do not run until/);
  });

  it("keeps the explicit-law staging runner off the shared discovery manifest and .env", () => {
    const source = readFileSync(
      join(root, "scripts/ingest-legalinfo-staging-canary.ts"),
      "utf8",
    );
    const lib = readFileSync(
      join(root, "scripts/lib/legalinfo-staging-canary.ts"),
      "utf8",
    );
    expect(source).toContain(".env.staging");
    expect(lib).toContain("legal-archive-staging");
    expect(lib).toContain("ep-frosty-frost-ax6pc5mf-pooler");
    expect(source).not.toContain("dotenv/config");
    expect(source).not.toContain("legalinfo-discovery-manifest.json");
    expect(source).not.toContain("FileLegalInfoManifestStore");
    expect(source).not.toContain("LEGALINFO_VERIFY_LAW_IDS");
    expect(source).not.toContain("ingest:legalinfo:cloud");
    expect(source).toContain("parseStagingLawIds");
  });
});
