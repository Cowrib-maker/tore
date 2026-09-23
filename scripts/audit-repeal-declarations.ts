/**
 * LOCAL-ONLY, read-only audit of the "хүчингүй болсонд тооцох тухай"
 * repeal-declaration edges already persisted by graph:populate. Produces
 * one machine-readable JSON row per REPEALS edge: source document,
 * target title, resolved target lawId if any, evidence text, and now
 * (Phase 8 of the temporal/authority intelligence foundation) whether
 * the repealING act's OWN effective date can be established —
 * classifying its entry-into-force clause and, for the dominant
 * cross-document-reference template, resolving the referenced law
 * against the local corpus by normalized title to borrow ITS OWN
 * (now-populated) effective date. Never invents a date: a target that
 * cannot be matched, or is matched but has no effective date of its
 * own, is reported as such, not silently dropped. Writes nothing —
 * SELECT only.
 *
 * Usage: npm run audit:repeal-declarations
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { classifyDatabaseUrl } from "./lib/database-url-safety";
import { LocalFilesystemArchiveStorage } from "../src/engine/data/archive";
import {
  extractLegalInfoMetadata,
  findEntryIntoForceClauseText,
} from "../src/engine/knowledge/adapters/mongolia/legalinfo/html";
import { classifyEntryIntoForceClause } from "../src/engine/knowledge/temporal/classify-entry-into-force-clause";
import { resolveRepealEffectiveDate } from "../src/engine/knowledge/temporal/resolve-repeal-effective-date";
import { normalizeLegalTitle } from "../src/application/legal-graph/project-legal-knowledge-graph";

const ARCHIVE_ROOT_DIR = ".data/legal-archive";

function loadEnvLocalDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    throw new Error(
      "[audit:repeal-declarations] DATABASE_URL not found in .env.local — refusing to guess a target database.",
    );
  }
  return match[1].trim();
}

type AuditRow = {
  sourceLawId: string | null;
  sourceTitle: string;
  targetTitle: string;
  targetLawId: string | null;
  resolved: boolean;
  evidenceText: string | null;
  confidence: "EXPLICIT";
  repealEffectiveDate: string | null;
  repealEffectiveDateStatus: string;
  repealEffectiveDateEvidence: string | null;
};

async function main(): Promise<void> {
  const databaseUrl = loadEnvLocalDatabaseUrl();
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.kind !== "local") {
    console.error(
      `[audit:repeal-declarations] Refusing to run: .env.local's DATABASE_URL is not local (${classification.kind}).`,
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const archiveStorage = new LocalFilesystemArchiveStorage(path.resolve(process.cwd(), ARCHIVE_ROOT_DIR));

  try {
    const edges = await prisma.legalKnowledgeGraphEdge.findMany({
      where: { edgeType: "REPEALS" },
      select: {
        fromDocumentId: true,
        toDocumentId: true,
        fromLabel: true,
        toLabel: true,
        evidence: true,
      },
      orderBy: { fromLabel: "asc" },
    });

    const fromIds = edges.map((e) => e.fromDocumentId).filter((x): x is string => !!x);
    const fromDocs = await prisma.legalKnowledgeDocument.findMany({
      where: { id: { in: fromIds } },
      select: { id: true, lawId: true, archiveId: true },
    });
    const fromDocById = new Map(fromDocs.map((d) => [d.id, d]));

    const toIds = edges.map((e) => e.toDocumentId).filter((x): x is string => !!x);
    const toDocs = await prisma.legalKnowledgeDocument.findMany({
      where: { id: { in: toIds } },
      select: { id: true, lawId: true },
    });
    const targetLawIdByDocId = new Map(toDocs.map((d) => [d.id, d.lawId]));

    // Corpus-wide title index for resolving a CROSS_DOCUMENT_REFERENCE's
    // referenced law — same normalization already used to resolve the
    // repeal declaration's own target (see project-legal-knowledge-graph.ts),
    // so both hops agree on what "the same law" means.
    const allDocs = await prisma.legalKnowledgeDocument.findMany({
      select: { id: true, title: true, validFrom: true },
    });
    const byNormalizedTitle = new Map(allDocs.map((d) => [normalizeLegalTitle(d.title), d]));

    const rows: AuditRow[] = [];
    for (const edge of edges) {
      const fromDoc = edge.fromDocumentId ? fromDocById.get(edge.fromDocumentId) : undefined;
      let repealEffectiveDate: string | null = null;
      let repealEffectiveDateStatus = "NOT_APPLICABLE";
      let repealEffectiveDateEvidence: string | null = null;

      if (fromDoc) {
        const archive = await prisma.legalSourceArchive.findUnique({
          where: { id: fromDoc.archiveId },
          select: { storageKey: true },
        });
        if (archive) {
          const bytes = await archiveStorage.get(archive.storageKey);
          if (bytes) {
            const html = new TextDecoder("utf-8").decode(bytes);
            const meta = extractLegalInfoMetadata(html);
            if (meta.effectiveOn) {
              // FIXED_DATE or SELF_ADOPTION_DATE already resolved this document's own effective date directly.
              repealEffectiveDate = meta.effectiveOn;
              repealEffectiveDateStatus = "RESOLVED_DIRECT";
              repealEffectiveDateEvidence = "resolved directly from this document's own entry-into-force clause";
            } else {
              const eifText = findEntryIntoForceClauseText(html);
              const eifEvidence = eifText ? classifyEntryIntoForceClause(eifText) : null;
              if (eifEvidence?.kind === "CROSS_DOCUMENT_REFERENCE") {
                const target =
                  byNormalizedTitle.get(normalizeLegalTitle(eifEvidence.referencedLawText)) ??
                  byNormalizedTitle.get(
                    normalizeLegalTitle(stripEditionMarkerAndTrailingHuuli(eifEvidence.referencedLawText)),
                  );
                const resolution = resolveRepealEffectiveDate(
                  eifEvidence,
                  target ? { found: true, effectiveFrom: target.validFrom } : { found: false },
                );
                repealEffectiveDateStatus = resolution.status;
                if (resolution.status === "RESOLVED") {
                  repealEffectiveDate = resolution.effectiveDate;
                }
                repealEffectiveDateEvidence = eifEvidence.evidenceText;
              } else if (eifEvidence) {
                repealEffectiveDateStatus = eifEvidence.kind;
                repealEffectiveDateEvidence = eifEvidence.evidenceText;
              }
            }
          }
        }
      }

      rows.push({
        sourceLawId: fromDoc?.lawId ?? null,
        sourceTitle: edge.fromLabel,
        targetTitle: edge.toLabel,
        targetLawId: edge.toDocumentId ? (targetLawIdByDocId.get(edge.toDocumentId) ?? null) : null,
        resolved: edge.toDocumentId !== null,
        evidenceText: edge.evidence,
        confidence: "EXPLICIT",
        repealEffectiveDate,
        repealEffectiveDateStatus,
        repealEffectiveDateEvidence,
      });
    }

    const summary = {
      totalRepealDeclarations: rows.length,
      resolved: rows.filter((r) => r.resolved).length,
      unresolved: rows.filter((r) => !r.resolved).length,
      allHaveEvidenceText: rows.every((r) => !!r.evidenceText),
      withRepealEffectiveDateEstablished: rows.filter((r) => r.repealEffectiveDate !== null).length,
      withRepealEffectiveDateUnknown: rows.filter((r) => r.repealEffectiveDate === null).length,
    };

    console.log(JSON.stringify({ summary, rows }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/**
 * A referenced law's title inside an entry-into-force clause is
 * regularly phrased "[base title] /Шинэчилсэн найруулга/ хууль" — the
 * edition-bracket qualifier plus a generic trailing "хууль" (law) word
 * that the target document's OWN stored title (from extractLegalInfoMetadata's
 * og:title/<title> priority) frequently omits (real finding, 2026-09-23:
 * lawId=563 is stored simply as "ХӨДӨЛМӨР ЭРХЛЭЛТИЙГ ДЭМЖИХ ТУХАЙ", with
 * no bracket, even though the page's own faceted-filter widget shows its
 * full designation carries "/ШИНЭЧИЛСЭН НАЙРУУЛГА/" separately). This is
 * a narrow, literal fallback for that exact known mismatch — never a
 * fuzzy/similarity match — tried only after an exact normalized-title
 * match has already failed.
 */
function stripEditionMarkerAndTrailingHuuli(text: string): string {
  return text
    .replace(/\/[^/]*\//g, " ")
    .replace(/\s*хуулиуд?ыг?\s*$/iu, "")
    .replace(/\s*хууль\s*$/iu, "")
    .trim();
}

main().catch((error) => {
  console.error("[audit:repeal-declarations] fatal error:", error);
  process.exit(1);
});
