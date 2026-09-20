import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  createArchiveService,
} from "@/engine/data/archive";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge";
import type { IKnowledgeRepository } from "@/engine/knowledge/types";
import { cacheVerifiedWebDocument } from "@/infrastructure/legal-web-research/cache-verified-web-document";

class SaveFailsKnowledgeRepository extends InMemoryKnowledgeRepository {
  async save(): Promise<never> {
    throw new Error("db unavailable");
  }
}

const FIXTURE_HTML = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-11259-administrative-general-law.html"),
  "utf8",
);
const SOURCE_URL = "https://legalinfo.mn/mn/detail?lawId=11259";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function buildArchive() {
  const dir = await mkdtemp(join(tmpdir(), "legal-web-research-cache-test-"));
  tempDirs.push(dir);
  return createArchiveService({
    storage: new LocalFilesystemArchiveStorage(dir),
    repository: new InMemoryArchiveRepository(),
  });
}

describe("cacheVerifiedWebDocument", () => {
  it("persists a verified live document so it becomes locally searchable", async () => {
    const archive = await buildArchive();
    const repository = new InMemoryKnowledgeRepository();

    const result = await cacheVerifiedWebDocument({
      html: FIXTURE_HTML,
      sourceUrl: SOURCE_URL,
      lawId: "11259",
      archive,
      repository,
    });
    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.archiveId).toBeTruthy();
      expect(result.contentSha256).toBeTruthy();
    }

    const stored = await repository.findBySourceUrl(SOURCE_URL);
    expect(stored).not.toBeNull();
    expect(stored!.title).toContain("ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ");
    expect(stored!.provenance?.sha256).toBeTruthy();
    expect(stored!.provenance?.archiveId).toBeTruthy();

    const hits = await repository.searchArticles({
      text: "56",
      articleNumber: "56",
      jurisdiction: "MN",
      officialSourceKinds: "all",
    });
    expect(hits.some((hit) => hit.articleNumber === "56")).toBe(true);
  });

  it("returns false (never throws) for unparsable HTML — never caches garbage", async () => {
    const archive = await buildArchive();
    const repository = new InMemoryKnowledgeRepository();

    const result = await cacheVerifiedWebDocument({
      html: "<html><body>not a law page</body></html>",
      sourceUrl: SOURCE_URL,
      lawId: "11259",
      archive,
      repository,
    });
    expect(result.cached).toBe(false);
    expect(await repository.findBySourceUrl(SOURCE_URL)).toBeNull();
  });

  it("caching the same document twice does not create a duplicate corpus entry", async () => {
    const archive = await buildArchive();
    const repository = new InMemoryKnowledgeRepository();

    const first = await cacheVerifiedWebDocument({
      html: FIXTURE_HTML,
      sourceUrl: SOURCE_URL,
      lawId: "11259",
      archive,
      repository,
    });
    const second = await cacheVerifiedWebDocument({
      html: FIXTURE_HTML,
      sourceUrl: SOURCE_URL,
      lawId: "11259",
      archive,
      repository,
    });

    expect(first.cached).toBe(true);
    expect(second.cached).toBe(true);
    if (first.cached && second.cached) {
      // Same content hash both times — same identity, not a new version.
      expect(second.contentSha256).toBe(first.contentSha256);
    }

    const all = await repository.list();
    const matchingSourceUrl = all.filter((doc) => doc.sourceUrl === SOURCE_URL);
    expect(matchingSourceUrl).toHaveLength(1);
  });

  it("returns cached:false (never throws) when the repository save itself fails", async () => {
    const archive = await buildArchive();
    const failingRepository: IKnowledgeRepository = new SaveFailsKnowledgeRepository();

    const result = await cacheVerifiedWebDocument({
      html: FIXTURE_HTML,
      sourceUrl: SOURCE_URL,
      lawId: "11259",
      archive,
      repository: failingRepository,
    });
    expect(result.cached).toBe(false);
  });
});
