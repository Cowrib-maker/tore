/**
 * LOCAL-ONLY, read-only audit of the "хүчингүй болсонд тооцох тухай"
 * repeal-declaration edges already persisted by graph:populate (Phase 4 of
 * the temporal/authority intelligence foundation). Produces one
 * machine-readable JSON row per REPEALS edge: source document, target
 * title, resolved target lawId if any, evidence text, and whether a
 * repeal-effective-date could be established (today: never — see the
 * report's own note below and resolve-legal-temporal-status.ts's
 * EXPLICIT_REPEAL_DATE_UNKNOWN basis). Writes nothing — SELECT only.
 *
 * Usage: npm run audit:repeal-declarations
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { classifyDatabaseUrl } from "./lib/database-url-safety";

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
  /**
   * Always false today: no field in the current schema/data captures the
   * repealING act's own effective date (validFrom/validTo are 0% populated
   * across the real 105-document corpus — see the Phase 1 domain audit).
   * Present as a named field, not silently omitted, so a future run where
   * this becomes true is a visible, honest change, not a hidden one.
   */
  repealEffectiveDateEstablished: boolean;
  confidence: "EXPLICIT";
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
      select: { id: true, lawId: true },
    });
    const lawIdByDocId = new Map(fromDocs.map((d) => [d.id, d.lawId]));

    const toIds = edges.map((e) => e.toDocumentId).filter((x): x is string => !!x);
    const toDocs = await prisma.legalKnowledgeDocument.findMany({
      where: { id: { in: toIds } },
      select: { id: true, lawId: true },
    });
    const targetLawIdByDocId = new Map(toDocs.map((d) => [d.id, d.lawId]));

    const rows: AuditRow[] = edges.map((edge) => ({
      sourceLawId: edge.fromDocumentId ? (lawIdByDocId.get(edge.fromDocumentId) ?? null) : null,
      sourceTitle: edge.fromLabel,
      targetTitle: edge.toLabel,
      targetLawId: edge.toDocumentId ? (targetLawIdByDocId.get(edge.toDocumentId) ?? null) : null,
      resolved: edge.toDocumentId !== null,
      evidenceText: edge.evidence,
      repealEffectiveDateEstablished: false,
      confidence: "EXPLICIT",
    }));

    const summary = {
      totalRepealDeclarations: rows.length,
      resolved: rows.filter((r) => r.resolved).length,
      unresolved: rows.filter((r) => !r.resolved).length,
      allHaveEvidenceText: rows.every((r) => !!r.evidenceText),
      allDateEstablished: rows.some((r) => r.repealEffectiveDateEstablished),
    };

    console.log(JSON.stringify({ summary, rows }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[audit:repeal-declarations] fatal error:", error);
  process.exit(1);
});
