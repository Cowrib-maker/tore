/**
 * LOCAL-ONLY Legal Knowledge Graph population.
 *
 * Projects the existing legal knowledge corpus (LegalKnowledgeDocument /
 * LegalKnowledgeArticle, plus archived HTML for LegalInfo cross-reference
 * evidence) into persisted graph edges (LegalKnowledgeGraphEdge), via the
 * existing projection functions in
 * src/application/legal-graph/project-legal-knowledge-graph.ts. This
 * script owns orchestration/batching/reporting only — it invents no
 * relationships and extracts no citations of its own.
 *
 * Scope this run actually populates (see the runbook/report for why):
 *   CONTAINS — every LegalKnowledgeDocument -> its LegalKnowledgeArticle rows.
 *   CITES    — explicit LegalInfo detail-link cross-references found in
 *              archived HTML, via the existing extractLegalInfoCrossReferences.
 * Deliberately NOT populated (no persisted or extracted source exists
 * anywhere in the repository for these today — see the population
 * report's "Unresolved Relationships" section, not fabricated here):
 *   REPEALS, SUPERSEDES, AMENDS, IMPLEMENTS, INTERPRETS, APPLIES, REFERS_TO.
 *
 * Safety: reads DATABASE_URL from .env.local only (never .env, which may
 * hold the production Neon URL — see db-migrate-local.ts's header for
 * why), and refuses to run against a non-local host. Archive bytes are
 * read only from the local filesystem store (.data/legal-archive) —
 * this script never talks to S3/production archive storage.
 *
 * Usage:
 *   npm run graph:populate -- --dry-run
 *   npm run graph:populate
 *   npm run graph:populate -- --batch-size 100
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { classifyDatabaseUrl } from "./lib/database-url-safety";

import { LocalFilesystemArchiveStorage } from "../src/engine/data/archive";
import { extractLegalInfoCrossReferences } from "../src/engine/knowledge/evidence/extract-legalinfo-cross-references";
import {
  projectCitationsFromReferences,
  projectDocumentContainment,
} from "../src/application/legal-graph/project-legal-knowledge-graph";
import type { PrismaLegalGraphRepository as PrismaLegalGraphRepositoryType } from "../src/infrastructure/repositories/prisma-legal-graph-repository";
import type { GraphEdgeUpsertInput } from "../src/engine/graph";

/**
 * PrismaLegalGraphRepository transitively imports
 * src/infrastructure/database/prisma.ts, which reads `@/lib/env` at
 * module scope and throws if DATABASE_URL/AUTH_SECRET aren't already
 * set in process.env — which they never are for a bare `tsx` script.
 * Deferred to a dynamic import inside main(), after this script has set
 * both from the safely-loaded, verified-local .env.local value, so that
 * module-scope validation sees what THIS script verified, not whatever
 * (or nothing) happens to be in the ambient shell environment.
 */
async function loadPrismaLegalGraphRepository() {
  const mod = await import("../src/infrastructure/repositories/prisma-legal-graph-repository");
  return mod.PrismaLegalGraphRepository;
}

const DEFAULT_BATCH_SIZE = 200;
const ARCHIVE_ROOT_DIR = ".data/legal-archive";
const HTML_MIME_PREFIX = "text/html";

type Args = {
  dryRun: boolean;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes("--dry-run");
  const batchSizeIndex = argv.indexOf("--batch-size");
  const batchSize =
    batchSizeIndex >= 0 && argv[batchSizeIndex + 1]
      ? Number.parseInt(argv[batchSizeIndex + 1]!, 10)
      : DEFAULT_BATCH_SIZE;
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch-size: ${argv[batchSizeIndex + 1]}`);
  }
  return { dryRun, batchSize };
}

function loadEnvLocalDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    throw new Error(
      "[graph:populate] DATABASE_URL not found in .env.local — refusing to guess a target database.",
    );
  }
  return match[1].trim();
}

type Report = {
  dryRun: boolean;
  documentsScanned: number;
  articlesScanned: number;
  archivesScanned: number;
  htmlArchivesFound: number;
  crossReferencesDiscovered: number;
  crossReferencesUnresolved: number;
  edgesByType: Record<string, number>;
  edgesInserted: number;
  edgesUpdated: number;
  errors: string[];
};

function emptyReport(dryRun: boolean): Report {
  return {
    dryRun,
    documentsScanned: 0,
    articlesScanned: 0,
    archivesScanned: 0,
    htmlArchivesFound: 0,
    crossReferencesDiscovered: 0,
    crossReferencesUnresolved: 0,
    edgesByType: {},
    edgesInserted: 0,
    edgesUpdated: 0,
    errors: [],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = loadEnvLocalDatabaseUrl();
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.kind !== "local") {
    console.error(
      `[graph:populate] Refusing to run: .env.local's DATABASE_URL is not local (${classification.kind}). ` +
        "This script only ever targets a local verification database.",
    );
    process.exit(1);
  }

  console.log(
    `[graph:populate] target: ${classification.hostname} | mode: ${args.dryRun ? "DRY RUN (no writes)" : "REAL RUN"} | batchSize: ${args.batchSize}`,
  );

  // Set before the deferred import below — see loadPrismaLegalGraphRepository's
  // doc comment. NODE_ENV=test lets @/lib/env default AUTH_SECRET instead of
  // demanding a real one this script has no legitimate use for.
  process.env.DATABASE_URL = databaseUrl;
  (process.env as { NODE_ENV?: string }).NODE_ENV ??= "test";
  const PrismaLegalGraphRepository = await loadPrismaLegalGraphRepository();

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const graphRepository = new PrismaLegalGraphRepository(prisma);
  const archiveStorage = new LocalFilesystemArchiveStorage(
    path.resolve(process.cwd(), ARCHIVE_ROOT_DIR),
  );

  const report = emptyReport(args.dryRun);

  try {
    let cursor: string | null = null;
    // Cursor pagination, not offset — stable under concurrent writes and
    // avoids Postgres re-scanning skipped rows on a large corpus.
    for (;;) {
      const documents: Array<{
        id: string;
        title: string;
        lawId: string | null;
        sourceUrl: string;
        archiveId: string;
      }> = await prisma.legalKnowledgeDocument.findMany({
        take: args.batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, title: true, lawId: true, sourceUrl: true, archiveId: true },
      });
      if (documents.length === 0) {
        break;
      }
      cursor = documents[documents.length - 1]!.id;
      report.documentsScanned += documents.length;

      await processBatch(documents, { prisma, graphRepository, archiveStorage, report, args });
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function processBatch(
  documents: Array<{ id: string; title: string; lawId: string | null; sourceUrl: string; archiveId: string }>,
  ctx: {
    prisma: PrismaClient;
    graphRepository: PrismaLegalGraphRepositoryType;
    archiveStorage: LocalFilesystemArchiveStorage;
    report: Report;
    args: Args;
  },
): Promise<void> {
  const { prisma, graphRepository, archiveStorage, report, args } = ctx;
  const documentIds = documents.map((d) => d.id);

  // One batched query for every article in this batch of documents —
  // never one query per document.
  const articles = await prisma.legalKnowledgeArticle.findMany({
    where: { documentId: { in: documentIds } },
    select: { id: true, documentId: true, title: true, articleNumber: true },
  });
  report.articlesScanned += articles.length;
  const articlesByDocument = new Map<string, typeof articles>();
  for (const article of articles) {
    const bucket = articlesByDocument.get(article.documentId) ?? [];
    bucket.push(article);
    articlesByDocument.set(article.documentId, bucket);
  }

  const containmentEdges: GraphEdgeUpsertInput[] = [];
  for (const document of documents) {
    const docArticles = articlesByDocument.get(document.id) ?? [];
    containmentEdges.push(
      ...projectDocumentContainment({
        id: document.id,
        title: document.title,
        articles: docArticles.map((a) => ({ id: a.id, title: a.title, articleNumber: a.articleNumber })),
      }),
    );
  }

  // One batched query for every archive in this batch — never one query
  // per document.
  const archiveIds = [...new Set(documents.map((d) => d.archiveId))];
  const archives = await prisma.legalSourceArchive.findMany({
    where: { id: { in: archiveIds } },
    select: { id: true, mimeType: true, storageKey: true },
  });
  report.archivesScanned += archives.length;
  const archiveById = new Map(archives.map((a) => [a.id, a]));

  const citationEdgesNested: GraphEdgeUpsertInput[][] = [];
  const htmlDocuments = documents.filter((d) => {
    const archive = archiveById.get(d.archiveId);
    return archive && archive.mimeType.toLowerCase().startsWith(HTML_MIME_PREFIX) && d.lawId;
  });

  if (htmlDocuments.length > 0) {
    // Read all needed HTML bytes and extract cross-references first, so
    // every target lawId this batch could possibly need is known before
    // issuing a single batched lookup query — never one lookup per
    // cross-reference.
    const perDocumentReferences: Array<{
      document: (typeof htmlDocuments)[number];
      references: ReturnType<typeof extractLegalInfoCrossReferences>;
    }> = [];
    const targetLawIds = new Set<string>();

    for (const document of htmlDocuments) {
      const archive = archiveById.get(document.archiveId)!;
      try {
        const bytes = await archiveStorage.get(archive.storageKey);
        if (!bytes) {
          report.errors.push(`archive bytes missing for document ${document.id} (storageKey ${archive.storageKey})`);
          continue;
        }
        report.htmlArchivesFound += 1;
        const rawHtml = new TextDecoder("utf-8").decode(bytes);
        const references = extractLegalInfoCrossReferences({
          sourceLawId: document.lawId!,
          sourceUrl: document.sourceUrl,
          rawHtml,
        });
        report.crossReferencesDiscovered += references.length;
        perDocumentReferences.push({ document, references });
        for (const reference of references) {
          targetLawIds.add(reference.targetLawId);
        }
      } catch (error) {
        report.errors.push(
          `failed reading/extracting archive for document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const targetDocuments =
      targetLawIds.size > 0
        ? await prisma.legalKnowledgeDocument.findMany({
            where: { lawId: { in: [...targetLawIds] } },
            select: { id: true, lawId: true, title: true },
          })
        : [];
    const targetByLawId = new Map(targetDocuments.map((d) => [d.lawId!, { documentId: d.id, title: d.title }]));
    for (const reference of targetLawIds) {
      if (!targetByLawId.has(reference)) {
        report.crossReferencesUnresolved += 1;
      }
    }

    for (const { document, references } of perDocumentReferences) {
      const edges = await projectCitationsFromReferences(
        document.id,
        document.title,
        references,
        async (lawId) => targetByLawId.get(lawId) ?? null,
      );
      citationEdgesNested.push(edges);
    }
  }

  const allEdges = [...containmentEdges, ...citationEdgesNested.flat()];
  for (const edge of allEdges) {
    report.edgesByType[edge.edgeType] = (report.edgesByType[edge.edgeType] ?? 0) + 1;
  }

  if (args.dryRun || allEdges.length === 0) {
    return;
  }

  try {
    const summary = await graphRepository.upsertEdges(allEdges);
    report.edgesInserted += summary.inserted;
    report.edgesUpdated += summary.updated;
  } catch (error) {
    report.errors.push(
      `batch upsert failed for documents [${documentIds.join(", ")}]: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

main().catch((error) => {
  console.error("[graph:populate] fatal error:", error);
  process.exit(1);
});
