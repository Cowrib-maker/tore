import { describe, expect, it, vi } from "vitest";

import {
  FileLegalInfoManifestStore,
  InMemoryLegalInfoManifestStore,
  LEGALINFO_INGESTION_CONCURRENCY,
  LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
  LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  LegalInfoDiscoverer,
  LegalInfoDocumentStatus,
  LegalInfoIngestionQueue,
  LegalInfoListClient,
  createEmptyManifest,
  legalInfoDetailUrl,
  parseLegalInfoListHtml,
  planLegalInfoIngestionDryRun,
  plannedActionForStatus,
  selectQueue,
} from "@/engine/knowledge";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function listHtml(items: Array<{ lawId: string; title: string }>, total = items.length): string {
  const rows = items
    .map(
      (item, index) => `
      <div class="shine-huuli-content">
        <span class="txt-number">${index + 1}</span>
        <a target="_blank" href="https://legalinfo.mn/mn/detail?lawId=${item.lawId}" class="act-name fw-500">${item.title}</a>
      </div>`,
    )
    .join("\n");
  return `
    ${rows}
    <ul class="uk-pagination">
      <li class="number uk-disabled"><span>1/1</span></li>
      <li class="number uk-disabled"><span>Нийт ${total}</span></li>
    </ul>`;
}

function lawDetailHtml(lawId: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${title}" />
  <script>var lawId = '${lawId}';</script>
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <div class="law_content pull-left">
    <div class="toolbar"><div>Pdf</div></div>
    <div class="maincontenter">
      <p>${title}</p>
      <p>НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ</p>
      ${body}
    </div>
  </div>
</body>
</html>`;
}

describe("parseLegalInfoListHtml", () => {
  it("extracts lawId, URL, and title from official list markup", () => {
    const items = parseLegalInfoListHtml(
      listHtml([
        { lawId: "367", title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ" },
        { lawId: "439", title: "ОРОН СУУЦНЫ ТУХАЙ" },
      ]),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      lawId: "367",
      officialUrl: legalInfoDetailUrl("367"),
      title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
    });
    expect(items[1]?.lawId).toBe("439");
  });
});

describe("LegalInfo discovery + manifest", () => {
  it("discovers documents from ajaxList pages into a PENDING manifest", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = String(init?.body ?? "");
      expect(body).toContain("filtercategorytypeid=27");
      return new Response(
        JSON.stringify({
          Html: listHtml(
            [
              { lawId: "367", title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ" },
              { lawId: "112", title: "БАРИЛГЫН ТУХАЙ" },
            ],
            2,
          ),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const discoverer = new LegalInfoDiscoverer({
      fetchImpl,
      categoryIds: ["27"],
      requestDelayMs: 0,
    });
    const result = await discoverer.discover();
    expect(result.discoveredCount).toBe(2);
    expect(result.pagesFetched).toBe(1);
    expect(result.manifest.documents.every((d) => d.status === "PENDING")).toBe(
      true,
    );
    expect(result.manifest.documents.map((d) => d.lawId).sort()).toEqual([
      "112",
      "367",
    ]);
  });

  it("persists and reloads a manifest via FileLegalInfoManifestStore", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tore-manifest-"));
    const path = join(dir, "manifest.json");
    try {
      const store = new FileLegalInfoManifestStore(path);
      const manifest = createEmptyManifest(["27"]);
      manifest.documents.push({
        lawId: "367",
        officialUrl: legalInfoDetailUrl("367"),
        sourceType: "constitution",
        categoryId: "26",
        title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
        discoveredAt: manifest.createdAt,
        status: LegalInfoDocumentStatus.PENDING,
        failureReason: null,
        sha256: null,
        duplicateOfLawId: null,
        articleCount: null,
        chunkCount: null,
        byteSize: null,
        lastAttemptAt: null,
        completedAt: null,
        attempts: 0,
      });
      await store.save(manifest);
      const raw = await readFile(path, "utf8");
      expect(raw).toContain('"lawId": "367"');
      const loaded = await store.load();
      expect(loaded?.documents).toHaveLength(1);
      expect(loaded?.documents[0]?.status).toBe("PENDING");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("resumable LegalInfo ingestion queue", () => {
  it("skips SUCCESS, retries FAILED, isolates errors, and marks duplicates", async () => {
    const htmlA = lawDetailHtml(
      "10",
      "ХУУЛЬ А",
      `<p>1 дүгээр зүйл.Зорилт</p><p>1.1.Энэ хуулийн зорилт нь А.</p>`,
    );
    const htmlB = lawDetailHtml(
      "20",
      "ХУУЛЬ Б",
      `<p>1 дүгээр зүйл.Зорилт</p><p>1.1.Энэ хуулийн зорилт нь Б.</p>`,
    );

    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("lawId=20")) {
        return new Response("missing", { status: 404 });
      }
      // Identical bytes for 10 and 30 → duplicate SHA-256 detection.
      if (url.includes("lawId=10") || url.includes("lawId=30")) {
        return new Response(htmlA, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("lawId=40")) {
        return new Response(htmlB, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const stamp = new Date().toISOString();
    const store = new InMemoryLegalInfoManifestStore({
      ...createEmptyManifest(["27"]),
      documents: [
        {
          lawId: "10",
          officialUrl: legalInfoDetailUrl("10"),
          sourceType: "law",
          categoryId: "27",
          title: "ХУУЛЬ А",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.PENDING,
          failureReason: null,
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: null,
          completedAt: null,
          attempts: 0,
        },
        {
          lawId: "20",
          officialUrl: legalInfoDetailUrl("20"),
          sourceType: "law",
          categoryId: "27",
          title: "ХУУЛЬ Б",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.FAILED,
          failureReason: "previous failure",
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: stamp,
          completedAt: null,
          attempts: 1,
        },
        {
          lawId: "30",
          officialUrl: legalInfoDetailUrl("30"),
          sourceType: "law",
          categoryId: "27",
          title: "ХУУЛЬ А COPY",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.PENDING,
          failureReason: null,
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: null,
          completedAt: null,
          attempts: 0,
        },
        {
          lawId: "40",
          officialUrl: legalInfoDetailUrl("40"),
          sourceType: "law",
          categoryId: "27",
          title: "ХУУЛЬ Б OK",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.SUCCESS,
          failureReason: null,
          sha256: "already-done",
          duplicateOfLawId: null,
          articleCount: 1,
          chunkCount: 1,
          byteSize: 100,
          lastAttemptAt: stamp,
          completedAt: stamp,
          attempts: 1,
        },
      ],
    });

    const queue = new LegalInfoIngestionQueue({
      store,
      fetchImpl,
      requestDelayMs: 0,
      timeoutMs: 5_000,
      retryFailed: true,
    });

    const first = await queue.run();
    expect(first.skippedSuccess).toBe(1);
    expect(first.succeeded).toBeGreaterThanOrEqual(1);
    expect(first.failed).toBe(1); // lawId 20 404
    expect(first.skippedDuplicate).toBe(1);

    const afterFirst = await store.load();
    expect(afterFirst?.documents.find((d) => d.lawId === "10")?.status).toBe(
      "SUCCESS",
    );
    expect(afterFirst?.documents.find((d) => d.lawId === "20")?.status).toBe(
      "FAILED",
    );
    expect(afterFirst?.documents.find((d) => d.lawId === "30")?.status).toBe(
      "SKIPPED_DUPLICATE",
    );
    expect(afterFirst?.documents.find((d) => d.lawId === "40")?.status).toBe(
      "SUCCESS",
    );
    // SUCCESS skip: law 40 never fetched
    expect(
      fetchImpl.mock.calls.some((call) => String(call[0]).includes("lawId=40")),
    ).toBe(false);

    // Resume: SUCCESS docs skipped; FAILED retried
    const second = await queue.run();
    expect(second.succeeded).toBe(0);
    expect(second.failed).toBe(1);
    expect(second.skippedSuccess).toBe(2); // law 10 + law 40
    expect(
      (await store.load())?.documents.find((d) => d.lawId === "20")?.attempts,
    ).toBeGreaterThanOrEqual(2);
  });

  it("selectQueue excludes SUCCESS and optionally FAILED", () => {
    const docs = [
      { lawId: "1", status: LegalInfoDocumentStatus.SUCCESS },
      { lawId: "2", status: LegalInfoDocumentStatus.PENDING },
      { lawId: "3", status: LegalInfoDocumentStatus.FAILED },
      { lawId: "4", status: LegalInfoDocumentStatus.SKIPPED_DUPLICATE },
      { lawId: "5", status: LegalInfoDocumentStatus.RUNNING },
    ] as const;

    expect(
      selectQueue(docs as never, { retryFailed: true }).join(","),
    ).toBe("2,3,5");
    expect(
      selectQueue(docs as never, { retryFailed: false }).join(","),
    ).toBe("2,5");
    expect(
      selectQueue(docs as never, { retryFailed: true, maxDocuments: 1 }),
    ).toEqual(["2"]);
  });

  it("does not classify zero-article legislation as SUCCESS", async () => {
    const emptyHtml = lawDetailHtml(
      "99",
      "ХООСОН ТУХАЙ",
      `<p>Зөвхөн оршил, зүйлгүй.</p>`,
    );
    const fetchImpl = vi.fn(async () =>
      new Response(emptyHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const stamp = new Date().toISOString();
    const store = new InMemoryLegalInfoManifestStore({
      ...createEmptyManifest(["27"]),
      documents: [
        {
          lawId: "99",
          officialUrl: legalInfoDetailUrl("99"),
          sourceType: "law",
          categoryId: "27",
          title: "ХООСОН ТУХАЙ",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.PENDING,
          failureReason: null,
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: null,
          completedAt: null,
          attempts: 0,
        },
      ],
    });

    const result = await new LegalInfoIngestionQueue({
      store,
      fetchImpl,
      requestDelayMs: 0,
    }).run();

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    const doc = (await store.load())?.documents[0];
    expect(doc?.status).toBe("FAILED");
    expect(doc?.failureReason).toMatch(/article count is 0/i);
  });
});

describe("LegalInfoListClient", () => {
  it("posts to ajaxList and returns parsed page metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          Html: listHtml([{ lawId: "367", title: "ҮНДСЭН ХУУЛЬ" }], 951),
        }),
        { status: 200 },
      ),
    );
    // Force total pages via pagination label
    const client = new LegalInfoListClient({ fetchImpl });
    const page = await client.fetchPage("27", 1);
    expect(page.items).toHaveLength(1);
    expect(page.categoryId).toBe("27");
    expect(page.totalCount).toBe(951);
  });
});

describe("LegalInfo ingestion dry-run planning", () => {
  it("maps resume statuses to planned actions", () => {
    expect(plannedActionForStatus(LegalInfoDocumentStatus.SUCCESS)).toBe(
      "skip_success",
    );
    expect(
      plannedActionForStatus(LegalInfoDocumentStatus.FAILED, {
        retryFailed: true,
      }),
    ).toBe("retry");
    expect(
      plannedActionForStatus(LegalInfoDocumentStatus.FAILED, {
        retryFailed: false,
      }),
    ).toBe("skip_failed_no_retry");
    expect(plannedActionForStatus(LegalInfoDocumentStatus.RUNNING)).toBe(
      "retry",
    );
    expect(plannedActionForStatus(LegalInfoDocumentStatus.PENDING)).toBe(
      "process",
    );
    expect(
      plannedActionForStatus(LegalInfoDocumentStatus.SKIPPED_DUPLICATE),
    ).toBe("skip_duplicate");
  });

  it("selects the first 10 PENDING docs without HTTP or manifest mutation", () => {
    const stamp = new Date().toISOString();
    const documents = Array.from({ length: 15 }, (_, i) => ({
      lawId: String(i + 1),
      officialUrl: legalInfoDetailUrl(String(i + 1)),
      sourceType: "law" as const,
      categoryId: "27",
      title: `LAW ${i + 1}`,
      discoveredAt: stamp,
      status:
        i === 0
          ? LegalInfoDocumentStatus.SUCCESS
          : i === 1
            ? LegalInfoDocumentStatus.FAILED
            : LegalInfoDocumentStatus.PENDING,
      failureReason: null,
      sha256: null,
      duplicateOfLawId: null,
      articleCount: null,
      chunkCount: null,
      byteSize: null,
      lastAttemptAt: null,
      completedAt: null,
      attempts: 0,
    }));
    const manifest = {
      ...createEmptyManifest(["27"]),
      documents,
    };
    const snapshot = structuredClone(manifest);

    const plan = planLegalInfoIngestionDryRun(manifest, {
      maxDocuments: 10,
      includeStatuses: [LegalInfoDocumentStatus.PENDING],
    });

    expect(plan.httpRequests).toBe(false);
    expect(plan.manifestMutations).toBe(false);
    expect(plan.checkpointWired).toBe(true);
    expect(plan.concurrency).toBe(LEGALINFO_INGESTION_CONCURRENCY);
    expect(plan.concurrency).toBe(1);
    expect(plan.requestDelayMs).toBe(LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS);
    expect(plan.timeoutMs).toBe(LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS);
    expect(plan.items).toHaveLength(10);
    expect(plan.items.every((item) => item.status === "PENDING")).toBe(true);
    expect(plan.items.every((item) => item.plannedAction === "process")).toBe(
      true,
    );
    // First PENDING after SUCCESS(1) and FAILED(2) is lawId 3
    expect(plan.items[0]?.lawId).toBe("3");
    expect(plan.items[9]?.lawId).toBe("12");
    // Dry-run must not mutate the input manifest
    expect(manifest).toEqual(snapshot);
  });

  it("can dry-run mixed actionable statuses (PENDING/FAILED/RUNNING)", () => {
    const stamp = new Date().toISOString();
    const manifest = {
      ...createEmptyManifest(["27"]),
      documents: [
        {
          lawId: "1",
          officialUrl: legalInfoDetailUrl("1"),
          sourceType: "law" as const,
          categoryId: "27",
          title: "A",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.SUCCESS,
          failureReason: null,
          sha256: "x",
          duplicateOfLawId: null,
          articleCount: 1,
          chunkCount: 1,
          byteSize: 1,
          lastAttemptAt: stamp,
          completedAt: stamp,
          attempts: 1,
        },
        {
          lawId: "2",
          officialUrl: legalInfoDetailUrl("2"),
          sourceType: "law" as const,
          categoryId: "27",
          title: "B",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.PENDING,
          failureReason: null,
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: null,
          completedAt: null,
          attempts: 0,
        },
        {
          lawId: "3",
          officialUrl: legalInfoDetailUrl("3"),
          sourceType: "law" as const,
          categoryId: "27",
          title: "C",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.FAILED,
          failureReason: "boom",
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: stamp,
          completedAt: null,
          attempts: 1,
        },
        {
          lawId: "4",
          officialUrl: legalInfoDetailUrl("4"),
          sourceType: "law" as const,
          categoryId: "27",
          title: "D",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.RUNNING,
          failureReason: null,
          sha256: null,
          duplicateOfLawId: null,
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: stamp,
          completedAt: null,
          attempts: 1,
        },
        {
          lawId: "5",
          officialUrl: legalInfoDetailUrl("5"),
          sourceType: "law" as const,
          categoryId: "27",
          title: "E",
          discoveredAt: stamp,
          status: LegalInfoDocumentStatus.SKIPPED_DUPLICATE,
          failureReason: "dup",
          sha256: "x",
          duplicateOfLawId: "1",
          articleCount: null,
          chunkCount: null,
          byteSize: null,
          lastAttemptAt: stamp,
          completedAt: stamp,
          attempts: 1,
        },
      ],
    };

    const plan = planLegalInfoIngestionDryRun(manifest, {
      maxDocuments: 10,
      includeStatuses: [
        LegalInfoDocumentStatus.PENDING,
        LegalInfoDocumentStatus.FAILED,
        LegalInfoDocumentStatus.RUNNING,
        LegalInfoDocumentStatus.SUCCESS,
        LegalInfoDocumentStatus.SKIPPED_DUPLICATE,
      ],
      retryFailed: true,
    });

    expect(plan.items.map((i) => `${i.lawId}:${i.plannedAction}`)).toEqual([
      "2:process",
      "3:retry",
      "4:retry",
    ]);
  });
});
