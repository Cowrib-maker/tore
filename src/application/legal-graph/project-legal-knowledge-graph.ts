/**
 * Legal Knowledge → Citation/Cross-reference → Graph Projection.
 *
 * Projects data TORE already has (LegalKnowledgeDocument/Article rows,
 * and the existing extractLegalInfoCrossReferences evidence extractor)
 * into graph edges. This module owns no legal text and extracts no new
 * citations of its own — it is a pure projection layer on top of the
 * existing, authoritative citation/knowledge systems, per instruction:
 * do not create a second citation system.
 *
 * Not wired into any route or the live Legal AI answer path (Phase 5).
 * A future operational script (mirroring scripts/ingest-legalinfo-*.ts)
 * is the intended caller.
 */

import {
  documentGraphId,
  externalGraphId,
  provisionGraphId,
  GraphEdgeType,
  type GraphEdgeUpsertInput,
} from "@/engine/graph";
import {
  extractLegalInfoCrossReferences,
  type LegalInfoCrossReference,
} from "@/engine/knowledge/evidence/extract-legalinfo-cross-references";
import { LegalIdentifierScheme } from "@/engine/knowledge/schema";

export type ProjectableArticle = {
  id: string;
  title: string | null;
  articleNumber: string | null;
};

export type ProjectableDocument = {
  id: string;
  title: string;
  articles: readonly ProjectableArticle[];
};

const DOCUMENT_STRUCTURE_SOURCE_KIND = "DOCUMENT_STRUCTURE";
const LEGALINFO_CROSS_REFERENCE_SOURCE_KIND = "LEGALINFO_CROSS_REFERENCE";

/**
 * Document → each of its articles, as CONTAINS edges. Pure and
 * synchronous: no archive/HTML access needed, since article order and
 * identity are already fully persisted in LegalKnowledgeArticle.
 */
export function projectDocumentContainment(
  document: ProjectableDocument,
): GraphEdgeUpsertInput[] {
  const fromNodeId = documentGraphId(document.id);
  return document.articles.map((article) => ({
    edgeType: GraphEdgeType.CONTAINS,
    fromNodeId,
    toNodeId: provisionGraphId(document.id, article.id),
    fromDocumentId: document.id,
    toDocumentId: document.id,
    fromLabel: document.title,
    toLabel: article.title ?? article.articleNumber ?? article.id,
    sourceKind: DOCUMENT_STRUCTURE_SOURCE_KIND,
  }));
}

export type ResolveLegalInfoLawTarget = (
  lawId: string,
) => Promise<{ documentId: string; title: string } | null>;

export type ProjectLegalInfoCitationsInput = {
  sourceDocumentId: string;
  sourceTitle: string;
  sourceLawId: string;
  sourceUrl: string;
  rawHtml: string;
  /**
   * Resolves a cited LegalInfo lawId to an already-ingested
   * LegalKnowledgeDocument, if one exists. Injected rather than reached
   * for directly so this module has no Prisma/repository dependency —
   * the caller (an application-layer composition point) decides how to
   * look documents up.
   */
  resolveTarget: ResolveLegalInfoLawTarget;
};

/**
 * Explicit LegalInfo detail-link citations → CITES edges, using the
 * existing extractLegalInfoCrossReferences evidence extractor verbatim
 * (CITES only — it deliberately never classifies AMENDS/REPEALS/
 * SUPERSEDES, and neither does this projection). A cited law that has
 * not been ingested yet still gets an edge, with toDocumentId left null
 * and toLabel synthesized from the lawId — see LegalKnowledgeGraphEdge's
 * doc comment on why edges have no foreign key.
 */
export async function projectLegalInfoCitations(
  input: ProjectLegalInfoCitationsInput,
): Promise<GraphEdgeUpsertInput[]> {
  const crossReferences = extractLegalInfoCrossReferences({
    sourceLawId: input.sourceLawId,
    sourceUrl: input.sourceUrl,
    rawHtml: input.rawHtml,
  });

  return projectCitationsFromReferences(
    input.sourceDocumentId,
    input.sourceTitle,
    crossReferences,
    input.resolveTarget,
  );
}

/**
 * Same projection as {@link projectLegalInfoCitations}, but takes
 * already-extracted cross-references directly. Exists so a batch caller
 * that already read and extracted a document's HTML once (e.g. to
 * discover every target lawId across a whole batch before doing one
 * bulk lookup) never has to re-decode and re-parse the same bytes a
 * second time just to reach this function's edge-shaping logic.
 */
export async function projectCitationsFromReferences(
  sourceDocumentId: string,
  sourceTitle: string,
  crossReferences: readonly LegalInfoCrossReference[],
  resolveTarget: ResolveLegalInfoLawTarget,
): Promise<GraphEdgeUpsertInput[]> {
  const fromNodeId = documentGraphId(sourceDocumentId);
  const edges: GraphEdgeUpsertInput[] = [];
  for (const reference of crossReferences) {
    const target = await resolveTarget(reference.targetLawId);
    edges.push(citationEdge(fromNodeId, sourceTitle, reference, target));
  }
  return edges;
}

function citationEdge(
  fromNodeId: string,
  sourceTitle: string,
  reference: LegalInfoCrossReference,
  target: { documentId: string; title: string } | null,
): GraphEdgeUpsertInput {
  return {
    edgeType: GraphEdgeType.CITES,
    fromNodeId,
    toNodeId: target ? documentGraphId(target.documentId) : externalLegalInfoNodeId(reference.targetLawId),
    fromDocumentId: null,
    toDocumentId: target?.documentId ?? null,
    fromLabel: sourceTitle,
    toLabel: target?.title ?? `LegalInfo law ${reference.targetLawId}`,
    sourceKind: LEGALINFO_CROSS_REFERENCE_SOURCE_KIND,
    evidence: reference.evidenceText || null,
  };
}

/**
 * Stable id for a cited-but-not-yet-ingested LegalInfo law, so the same
 * forward reference always upserts the same edge instead of duplicating
 * once per ingestion run. Uses the same externalGraphId scheme
 * (src/engine/graph/ids.ts) and LegalIdentifierScheme.LEGALINFO_LAW_ID
 * (src/engine/knowledge/schema.ts) GraphBuilder itself would use for an
 * EXTERNAL_AUTHORITY target of the same law, so if that law is later
 * ingested and re-linked in-memory, both paths agree on one node id.
 */
function externalLegalInfoNodeId(lawId: string): string {
  return externalGraphId(LegalIdentifierScheme.LEGALINFO_LAW_ID, lawId);
}
