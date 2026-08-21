import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  sha256Hex,
  type ArchiveService,
} from "@/engine/data/archive";
import { ParagraphKnowledgeChunker } from "../chunker";
import { InMemoryKnowledgeCrawler } from "../crawler/crawler.service";
import {
  HttpKnowledgeCrawler,
  type FetchLike,
} from "../crawler/http-knowledge-crawler";
import { JsonKnowledgeExporter } from "../exporter";
import { RuleBasedKnowledgeMetadataExtractor } from "../metadata";
import { UnicodeKnowledgeNormalizer } from "../normalizer";
import { LegalInfoKnowledgeParser } from "../parser/legalinfo-knowledge.parser";
import { StructuralKnowledgeParser } from "../parser";
import { InMemoryKnowledgeRepository } from "../repository";
import { KnowledgeEngine } from "../services";
import type {
  IKnowledgeRepository,
  RawKnowledgeDocument,
  StoredKnowledgeDocument,
} from "../types";
import type { ILegalInfoManifestStore } from "./manifest-store";
import {
  LegalInfoDocumentStatus,
  type LegalInfoManifest,
  type LegalInfoManifestDocument,
} from "./types";

/** Default sequential pacing used by the live queue. */
export const LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS = 300;
export const LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS = 60_000;
/** HttpKnowledgeCrawler processes one URL at a time (no parallel floods). */
export const LEGALINFO_INGESTION_CONCURRENCY = 1 as const;

export type LegalInfoIngestionQueueOptions = {
  store: ILegalInfoManifestStore;
  fetchImpl?: FetchLike;
  archive?: ArchiveService;
  /** Temp archive root when archive is not injected. */
  archiveRootDir?: string;
  /**
   * Optional durable knowledge repository (e.g. Prisma + archive verification).
   * When omitted, structured knowledge is only held in the per-document
   * in-memory engine used for validation (existing script behavior).
   */
  knowledgeRepository?: IKnowledgeRepository;
  requestDelayMs?: number;
  timeoutMs?: number;
  /** Max documents to attempt in this run (PENDING + FAILED). */
  maxDocuments?: number;
  /**
   * When set, only these lawIds are eligible (still subject to SUCCESS skip
   * and status selection). Used by bounded production batches.
   */
  onlyLawIds?: readonly string[];
  /** Retry FAILED documents. Default true. */
  retryFailed?: boolean;
  now?: () => Date;
};

export type LegalInfoIngestionQueueResult = {
  manifest: LegalInfoManifest;
  attempted: number;
  succeeded: number;
  failed: number;
  skippedSuccess: number;
  skippedDuplicate: number;
};

/**
 * Resumable LegalInfo ingestion over a persisted manifest.
 *
 * - SUCCESS documents are not downloaded again
 * - FAILED documents are retried when retryFailed is true
 * - SKIPPED_DUPLICATE is set when SHA-256 matches an earlier SUCCESS
 * - One failure does not abort the remaining queue
 * - Progress is checkpointed after each document
 *
 * Reuses HttpKnowledgeCrawler + LegalInfoKnowledgeParser + ArchiveService.
 * Does not change createKnowledgeEngine() defaults.
 */
export class LegalInfoIngestionQueue {
  private readonly store: ILegalInfoManifestStore;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly archive: ArchiveService | undefined;
  private readonly archiveRootDir: string | undefined;
  private readonly knowledgeRepository: IKnowledgeRepository | undefined;
  private readonly requestDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxDocuments: number | undefined;
  private readonly onlyLawIds: ReadonlySet<string> | undefined;
  private readonly retryFailed: boolean;
  private readonly now: () => Date;

  constructor(options: LegalInfoIngestionQueueOptions) {
    this.store = options.store;
    this.fetchImpl = options.fetchImpl;
    this.archive = options.archive;
    this.archiveRootDir = options.archiveRootDir;
    this.knowledgeRepository = options.knowledgeRepository;
    this.requestDelayMs = Math.max(
      0,
      options.requestDelayMs ?? LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    );
    this.timeoutMs = options.timeoutMs ?? LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS;
    this.maxDocuments = options.maxDocuments;
    this.onlyLawIds =
      options.onlyLawIds && options.onlyLawIds.length > 0
        ? new Set(options.onlyLawIds)
        : undefined;
    this.retryFailed = options.retryFailed ?? true;
    this.now = options.now ?? (() => new Date());
  }

  async run(): Promise<LegalInfoIngestionQueueResult> {
    const loaded = await this.store.load();
    if (!loaded) {
      throw new Error("No LegalInfo manifest found — run discovery first");
    }

    // Default engine wiring must remain offline (InMemory crawler).
    const defaultEngine = new KnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler(),
      parser: new StructuralKnowledgeParser(),
      normalizer: new UnicodeKnowledgeNormalizer(),
      metadata: new RuleBasedKnowledgeMetadataExtractor(),
      chunker: new ParagraphKnowledgeChunker(),
      repository: new InMemoryKnowledgeRepository(),
      exporter: new JsonKnowledgeExporter(),
    });
    const defaultProbe = await defaultEngine.ingest({ sourceId: "legalinfo" });
    if (defaultProbe.ingested.length !== 0) {
      throw new Error("Unexpected: default engine should start empty");
    }

    let ownsTempArchiveDir: string | null = null;
    const archive =
      this.archive ??
      (await (async () => {
        if (this.archiveRootDir) {
          return createArchiveService({
            repository: new InMemoryArchiveRepository(),
            storage: new LocalFilesystemArchiveStorage(this.archiveRootDir),
          });
        }
        ownsTempArchiveDir = await mkdtemp(
          join(tmpdir(), "tore-legalinfo-queue-"),
        );
        return createArchiveService({
          repository: new InMemoryArchiveRepository(),
          storage: new LocalFilesystemArchiveStorage(ownsTempArchiveDir),
        });
      })());

    const shaToLawId = new Map<string, string>();
    for (const doc of loaded.documents) {
      if (
        doc.status === LegalInfoDocumentStatus.SUCCESS &&
        doc.sha256
      ) {
        shaToLawId.set(doc.sha256, doc.lawId);
      }
    }

    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedSuccess = loaded.documents.filter(
      (doc) => doc.status === LegalInfoDocumentStatus.SUCCESS,
    ).length;
    let skippedDuplicate = 0;

    try {
      const queue = selectQueue(loaded.documents, {
        retryFailed: this.retryFailed,
        maxDocuments: this.maxDocuments,
        onlyLawIds: this.onlyLawIds,
      });

      for (const lawId of queue) {
        const manifest = (await this.store.load()) ?? loaded;
        const index = manifest.documents.findIndex((d) => d.lawId === lawId);
        if (index < 0) {
          continue;
        }
        const current = manifest.documents[index]!;

        if (current.status === LegalInfoDocumentStatus.SUCCESS) {
          continue;
        }

        const running: LegalInfoManifestDocument = {
          ...current,
          status: LegalInfoDocumentStatus.RUNNING,
          lastAttemptAt: this.now().toISOString(),
          attempts: current.attempts + 1,
          failureReason: null,
        };
        manifest.documents[index] = running;
        manifest.updatedAt = this.now().toISOString();
        manifest.checkpoint.lastProcessedLawId = lawId;
        await this.store.save(manifest);

        attempted += 1;
        const outcome = await this.ingestOne(running, archive);

        const latest = (await this.store.load()) ?? manifest;
        const latestIndex = latest.documents.findIndex((d) => d.lawId === lawId);
        if (latestIndex < 0) {
          continue;
        }

        if (outcome.ok) {
          const prior = shaToLawId.get(outcome.sha256);
          if (prior && prior !== lawId) {
            latest.documents[latestIndex] = {
              ...latest.documents[latestIndex]!,
              status: LegalInfoDocumentStatus.SKIPPED_DUPLICATE,
              sha256: outcome.sha256,
              duplicateOfLawId: prior,
              title: outcome.title,
              articleCount: outcome.articleCount,
              chunkCount: outcome.chunkCount,
              byteSize: outcome.byteSize,
              failureReason: `duplicate content SHA-256 matches lawId=${prior}`,
              completedAt: this.now().toISOString(),
            };
            skippedDuplicate += 1;
          } else {
            shaToLawId.set(outcome.sha256, lawId);
            latest.documents[latestIndex] = {
              ...latest.documents[latestIndex]!,
              status: LegalInfoDocumentStatus.SUCCESS,
              sha256: outcome.sha256,
              duplicateOfLawId: null,
              title: outcome.title,
              articleCount: outcome.articleCount,
              chunkCount: outcome.chunkCount,
              byteSize: outcome.byteSize,
              failureReason: null,
              completedAt: this.now().toISOString(),
            };
            succeeded += 1;
          }
        } else {
          latest.documents[latestIndex] = {
            ...latest.documents[latestIndex]!,
            status: LegalInfoDocumentStatus.FAILED,
            failureReason: outcome.reason,
            completedAt: null,
          };
          failed += 1;
        }

        latest.updatedAt = this.now().toISOString();
        latest.checkpoint.lastProcessedLawId = lawId;
        await this.store.save(latest);

        if (this.requestDelayMs > 0) {
          await sleep(this.requestDelayMs);
        }
      }

      const finalManifest = (await this.store.load()) ?? loaded;
      return {
        manifest: finalManifest,
        attempted,
        succeeded,
        failed,
        skippedSuccess,
        skippedDuplicate,
      };
    } finally {
      if (ownsTempArchiveDir) {
        await rm(ownsTempArchiveDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  private async ingestOne(
    doc: LegalInfoManifestDocument,
    archive: ArchiveService,
  ): Promise<
    | {
        ok: true;
        sha256: string;
        title: string;
        articleCount: number;
        chunkCount: number;
        byteSize: number;
      }
    | { ok: false; reason: string }
  > {
    const crawlErrors: string[] = [];
    const crawler = new HttpKnowledgeCrawler({
      lawIds: [doc.lawId],
      archive,
      fetchImpl: this.fetchImpl,
      maxRetries: 2,
      timeoutMs: this.timeoutMs,
      requestDelayMs: 0,
      onDocumentError: ({ error }) => {
        crawlErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      },
    });

    let rawDocuments: RawKnowledgeDocument[] = [];
    try {
      rawDocuments = await crawler.crawl({
        sourceId: "legalinfo",
        urls: [doc.officialUrl],
        maxDocuments: 1,
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (rawDocuments.length === 0) {
      return {
        ok: false,
        reason: crawlErrors[0] ?? "HTTP crawl returned no document",
      };
    }

    const raw = rawDocuments[0]!;
    const contentHash = sha256Hex(raw.bytes);
    const archiveRecord = await archive.findByHash(contentHash);
    if (!archiveRecord) {
      return { ok: false, reason: "missing archive checksum" };
    }
    if (archiveRecord.sha256 !== contentHash) {
      return { ok: false, reason: "archive checksum mismatch" };
    }

    try {
      await archive.verifyArchiveIntegrity(contentHash);
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "archive integrity verification failed",
      };
    }

    const repository = new InMemoryKnowledgeRepository();
    const engine = new KnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([raw]),
      parser: new LegalInfoKnowledgeParser(),
      normalizer: new UnicodeKnowledgeNormalizer(),
      metadata: new RuleBasedKnowledgeMetadataExtractor(),
      chunker: new ParagraphKnowledgeChunker(),
      repository,
      exporter: new JsonKnowledgeExporter(),
    });

    const result = await engine.ingest({
      sourceId: "legalinfo",
      urls: [doc.officialUrl],
      maxDocuments: 1,
    });

    if (result.failed.length > 0) {
      return {
        ok: false,
        reason: result.failed[0]?.reason ?? "ingestion failed",
      };
    }

    const stored = result.ingested[0] as StoredKnowledgeDocument | undefined;
    if (!stored) {
      return { ok: false, reason: "ingestion produced no stored document" };
    }

    const title = stored.title?.trim() ?? "";
    if (!title) {
      return { ok: false, reason: "empty title" };
    }
    if (stored.articles.length === 0) {
      return {
        ok: false,
        reason: "parser/source-structure failure: article count is 0",
      };
    }
    if (stored.chunks.length === 0) {
      return { ok: false, reason: "chunk count is 0" };
    }

    if (this.knowledgeRepository) {
      try {
        await this.knowledgeRepository.save({
          ...stored,
          provenance: {
            archiveId: archiveRecord.archiveId,
            sha256: contentHash,
            originalUrl: archiveRecord.originalUrl,
            lawId: doc.lawId,
          },
        });
      } catch (error) {
        return {
          ok: false,
          reason: `durable knowledge persistence failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    return {
      ok: true,
      sha256: contentHash,
      title,
      articleCount: stored.articles.length,
      chunkCount: stored.chunks.length,
      byteSize: raw.bytes.byteLength,
    };
  }
}

export function selectQueue(
  documents: readonly LegalInfoManifestDocument[],
  options: {
    retryFailed: boolean;
    maxDocuments?: number;
    onlyLawIds?: ReadonlySet<string>;
  },
): string[] {
  const selected: string[] = [];
  for (const doc of documents) {
    if (options.onlyLawIds && !options.onlyLawIds.has(doc.lawId)) {
      continue;
    }
    if (doc.status === LegalInfoDocumentStatus.SUCCESS) {
      continue;
    }
    if (doc.status === LegalInfoDocumentStatus.SKIPPED_DUPLICATE) {
      continue;
    }
    if (
      doc.status === LegalInfoDocumentStatus.FAILED &&
      !options.retryFailed
    ) {
      continue;
    }
    // PENDING, FAILED (retry), or interrupted RUNNING
    if (
      doc.status === LegalInfoDocumentStatus.PENDING ||
      doc.status === LegalInfoDocumentStatus.FAILED ||
      doc.status === LegalInfoDocumentStatus.RUNNING
    ) {
      selected.push(doc.lawId);
    }
    if (
      options.maxDocuments != null &&
      selected.length >= options.maxDocuments
    ) {
      break;
    }
  }
  return selected;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PlannedIngestionAction =
  | "process"
  | "retry"
  | "skip_success"
  | "skip_duplicate"
  | "skip_failed_no_retry";

export type DryRunPlanItem = {
  lawId: string;
  officialUrl: string;
  status: LegalInfoDocumentStatus;
  plannedAction: PlannedIngestionAction;
};

export type LegalInfoIngestionDryRunPlan = {
  items: DryRunPlanItem[];
  /** Always 1 — sequential crawler, does not flood LegalInfo. */
  concurrency: typeof LEGALINFO_INGESTION_CONCURRENCY;
  requestDelayMs: number;
  timeoutMs: number;
  retryFailed: boolean;
  /** Checkpoint would update lastProcessedLawId after each doc (not applied in dry-run). */
  checkpointWired: true;
  httpRequests: false;
  manifestMutations: false;
};

/**
 * Map a manifest status to the action the resumable queue would take.
 */
export function plannedActionForStatus(
  status: LegalInfoDocumentStatus,
  options: { retryFailed: boolean } = { retryFailed: true },
): PlannedIngestionAction {
  switch (status) {
    case LegalInfoDocumentStatus.SUCCESS:
      return "skip_success";
    case LegalInfoDocumentStatus.SKIPPED_DUPLICATE:
      return "skip_duplicate";
    case LegalInfoDocumentStatus.FAILED:
      return options.retryFailed ? "retry" : "skip_failed_no_retry";
    case LegalInfoDocumentStatus.RUNNING:
      return "retry";
    case LegalInfoDocumentStatus.PENDING:
      return "process";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Safe dry-run planner: no HTTP, no manifest writes.
 * Defaults to the first N PENDING documents (verification preview).
 */
export function planLegalInfoIngestionDryRun(
  manifest: LegalInfoManifest,
  options: {
    maxDocuments?: number;
    includeStatuses?: readonly LegalInfoDocumentStatus[];
    retryFailed?: boolean;
    requestDelayMs?: number;
    timeoutMs?: number;
  } = {},
): LegalInfoIngestionDryRunPlan {
  const retryFailed = options.retryFailed ?? true;
  const maxDocuments = options.maxDocuments ?? 10;
  const includeStatuses = options.includeStatuses ?? [
    LegalInfoDocumentStatus.PENDING,
  ];
  const include = new Set(includeStatuses);

  const items: DryRunPlanItem[] = [];
  for (const doc of manifest.documents) {
    if (!include.has(doc.status)) {
      continue;
    }
    const plannedAction = plannedActionForStatus(doc.status, { retryFailed });
    // Mirror selectQueue: never plan work for skip_* actions even if included.
    if (
      plannedAction === "skip_success" ||
      plannedAction === "skip_duplicate" ||
      plannedAction === "skip_failed_no_retry"
    ) {
      continue;
    }
    items.push({
      lawId: doc.lawId,
      officialUrl: doc.officialUrl,
      status: doc.status,
      plannedAction,
    });
    if (items.length >= maxDocuments) {
      break;
    }
  }

  return {
    items,
    concurrency: LEGALINFO_INGESTION_CONCURRENCY,
    requestDelayMs:
      options.requestDelayMs ?? LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: options.timeoutMs ?? LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
    retryFailed,
    checkpointWired: true,
    httpRequests: false,
    manifestMutations: false,
  };
}
