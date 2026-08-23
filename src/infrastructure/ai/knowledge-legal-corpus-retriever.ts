import type {
  LegalCitationVerifyResult,
  LegalCorpusAuthority,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { CitationVerificationStatus } from "@/application/ai/legal-corpus";
import { detectExactCitation } from "@/engine/citation";
import type { DetectedExactCitation } from "@/engine/citation";
import {
  evaluateVersionForTemporalQuery,
  parseLegalTemporalQueryIntent,
  type LegalTemporalExplicitRelation,
  type LegalTemporalQueryIntent,
} from "@/engine/knowledge";
import { KnowledgeMatchKind } from "@/engine/knowledge/types";
import type {
  IKnowledgeRepository,
  KnowledgeArticleHit,
  StoredKnowledgeDocument,
} from "@/engine/knowledge/types";

export const LOCAL_LEGAL_SOURCE_TYPE = "legal-knowledge";

function unavailableNotFound(): LegalCorpusRetrieveResult {
  return {
    kind: "unavailable",
    reason: "not_found",
    authorities: [],
    retrievedAt: null,
  };
}

function asOfUnavailable(): LegalCorpusRetrieveResult {
  return {
    kind: "as_of_unavailable",
    authorities: [],
    retrievedAt: null,
  };
}

function hasVerifiedProvenance(
  document: StoredKnowledgeDocument | null,
): document is StoredKnowledgeDocument {
  const sha = document?.provenance?.sha256?.trim();
  const archiveId = document?.provenance?.archiveId?.trim();
  return Boolean(sha && archiveId);
}

function titleMatchesHint(title: string, hint: string): boolean {
  return title.toLowerCase().includes(hint.toLowerCase().trim());
}

function wantedArticleNumbers(citation: DetectedExactCitation): string[] {
  const dotted = citation.paragraph
    ? `${citation.article}.${citation.paragraph}`
    : citation.article;
  if (citation.paragraph && dotted !== citation.article) {
    return [dotted, citation.article];
  }
  return [citation.article];
}

function articleNumberOf(hit: KnowledgeArticleHit): string {
  return (hit.articleNumber ?? "").trim();
}

function preferDottedHits(
  hits: KnowledgeArticleHit[],
  citation: DetectedExactCitation,
): KnowledgeArticleHit[] {
  if (!citation.paragraph) {
    return hits;
  }
  const dotted = `${citation.article}.${citation.paragraph}`;
  const exactDotted = hits.filter((hit) => articleNumberOf(hit) === dotted);
  return exactDotted.length > 0 ? exactDotted : hits;
}

function uniqueByArticleId(hits: KnowledgeArticleHit[]): KnowledgeArticleHit[] {
  const seen = new Set<string>();
  const out: KnowledgeArticleHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.articleId)) {
      continue;
    }
    seen.add(hit.articleId);
    out.push(hit);
  }
  return out;
}

function isoDateFromClock(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function versionIsProven(
  document: StoredKnowledgeDocument,
  intent: LegalTemporalQueryIntent,
  nowIsoDate: string,
  explicitRelations: readonly LegalTemporalExplicitRelation[],
): boolean {
  return evaluateVersionForTemporalQuery(
    {
      validFrom: document.metadata.validFrom ?? null,
      validTo: document.metadata.validTo ?? null,
      lawId: document.provenance?.lawId ?? null,
      sourceStatus: document.metadata.sourceStatus ?? null,
      explicitRelations,
      title: document.title,
    },
    intent,
    nowIsoDate,
  ).proven;
}

/**
 * Exact title + article lookup over {@link IKnowledgeRepository}.
 * No embeddings, no semantic RAG, no invented statute text.
 *
 * Historical/current questions are filtered with
 * {@link evaluateVersionForTemporalQuery}. UNKNOWN is never grounded as
 * verified applicable law. Unspecified questions still require provenance
 * but do not treat the latest scrape as current force.
 */
export class KnowledgeLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(
    private readonly knowledge: IKnowledgeRepository,
    private readonly options: {
      now?: () => Date;
    } = {},
  ) {}

  async retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const hits = await this.lookupVerifiedHits({
      question: input.question,
      query: input.query || input.question,
      explicitRelations: input.explicitRelations ?? [],
    });
    if (hits.kind === "as_of_unavailable") {
      return asOfUnavailable();
    }
    if (hits.hits.length === 0) {
      return unavailableNotFound();
    }

    return {
      kind: "retrieved",
      status: "ok",
      authorities: hits.hits.map((item) => item.authority),
      retrievedAt: new Date().toISOString(),
    };
  }
  async retrieveLegalQuestion(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const temporalText = [input.question, input.query]
      .filter((part) => part?.trim())
      .join(" ");

    const intent = parseLegalTemporalQueryIntent(temporalText);
    const nowIsoDate = isoDateFromClock(
      this.options.now?.() ?? new Date(),
    );

    const hits = await this.knowledge.searchArticles({
      text: input.question || input.query,
      jurisdiction: "MN",
      limit: 8,
    });

    const uniqueHits = uniqueByArticleId(hits);

    const verified: LegalCorpusAuthority[] = [];

    for (const hit of uniqueHits) {
      const document = await this.knowledge.findById(hit.documentId);

      if (!hasVerifiedProvenance(document)) {
        continue;
      }

      if (
        !versionIsProven(
          document,
          intent,
          nowIsoDate,
          input.explicitRelations ?? [],
        )
      ) {
        continue;
      }

      verified.push(
        toLocalAuthority(
          hit,
          document,
          {
            article: articleNumberOf(hit),
            paragraph: null,
            locator: articleNumberOf(hit),
            titleHint: hit.documentTitle,
          } as DetectedExactCitation,
        ),
      );
    }

    if (verified.length === 0) {
      const requiresProof =
        intent.kind === "HISTORICAL" || intent.kind === "CURRENT";

      if (requiresProof && uniqueHits.length > 0) {
        const documents = await Promise.all(
          uniqueHits.map((hit) => this.knowledge.findById(hit.documentId)),
        );

        if (
          documents.some((document) => hasVerifiedProvenance(document))
        ) {
          return asOfUnavailable();
        }
      }

      return unavailableNotFound();
    }

    return {
      kind: "retrieved",
      status: "ok",
      authorities: verified,
      retrievedAt: new Date().toISOString(),
    };
  }
  async verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    const hits = await this.lookupVerifiedHits({
      question: input.question,
      query: input.query,
      explicitRelations: input.explicitRelations ?? [],
    });
    if (hits.kind === "as_of_unavailable") {
      return {
        ok: true,
        verdict: {
          query: input.query,
          status: CitationVerificationStatus.UNRESOLVED,
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["temporal_applicability_unknown"],
        },
      };
    }
    if (hits.hits.length === 0) {
      return {
        ok: true,
        verdict: {
          query: input.query,
          status: CitationVerificationStatus.UNRESOLVED,
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["citation_not_in_local_corpus"],
        },
      };
    }

    if (hits.hits.length > 1) {
      return {
        ok: true,
        verdict: {
          query: input.query,
          status: CitationVerificationStatus.CONFLICT,
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["citation_conflict"],
        },
      };
    }

    const [hit] = hits.hits;
    if (input.nodeId && hit && hit.authority.nodeId !== input.nodeId) {
      return {
        ok: true,
        verdict: {
          query: input.query,
          status: CitationVerificationStatus.UNRESOLVED,
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["citation_unresolved"],
        },
      };
    }

    return {
      ok: true,
      verdict: {
        query: input.query,
        status: CitationVerificationStatus.VALID,
        nodeId: hit?.authority.nodeId ?? null,
        documentVersionId: hit?.authority.documentVersionId ?? null,
        locator: hit?.authority.locator ?? null,
        reasons: ["citation_unique", "local_provenance"],
      },
    };
  }

  private async lookupVerifiedHits(input: {
    question?: string;
    query: string;
    explicitRelations: readonly LegalTemporalExplicitRelation[];
  }): Promise<
    | {
        kind: "hits";
        hits: Array<{
          hit: KnowledgeArticleHit;
          authority: LegalCorpusAuthority;
        }>;
      }
    | { kind: "as_of_unavailable" }
  > {
    const temporalText = [input.question, input.query]
      .filter((part) => part?.trim())
      .join(" ");
    const citation =
      detectExactCitation(temporalText) ?? detectExactCitation(input.query);
    if (!citation) {
      return { kind: "hits", hits: [] };
    }

    const intent = parseLegalTemporalQueryIntent(temporalText);
    const nowIsoDate = isoDateFromClock(this.options.now?.() ?? new Date());
    const explicitRelations = input.explicitRelations;

    const collected: KnowledgeArticleHit[] = [];
    for (const articleNumber of wantedArticleNumbers(citation)) {
      const hits = await this.knowledge.searchArticles({
        text: citation.titleHint,
        articleNumber,
        jurisdiction: "MN",
        limit: 20,
      });
      collected.push(...hits);
    }

    const exact = uniqueByArticleId(collected).filter(
      (hit) =>
        hit.matchKind === KnowledgeMatchKind.ARTICLE_NUMBER &&
        titleMatchesHint(hit.documentTitle, citation.titleHint),
    );
    const preferred = preferDottedHits(exact, citation);

    const verified: Array<{
      hit: KnowledgeArticleHit;
      authority: LegalCorpusAuthority;
    }> = [];

    for (const hit of preferred) {
      const document = await this.knowledge.findById(hit.documentId);
      if (!hasVerifiedProvenance(document)) {
        continue;
      }
      if (!versionIsProven(document, intent, nowIsoDate, explicitRelations)) {
        continue;
      }
      verified.push({
        hit,
        authority: toLocalAuthority(hit, document, citation),
      });
    }

    const requiresProof =
      intent.kind === "HISTORICAL" || intent.kind === "CURRENT";
    if (requiresProof && preferred.length > 0 && verified.length === 0) {
      const documents = await Promise.all(
        preferred.map((hit) => this.knowledge.findById(hit.documentId)),
      );
      if (documents.some((document) => hasVerifiedProvenance(document))) {
        return { kind: "as_of_unavailable" };
      }
    }

    return { kind: "hits", hits: verified };
  }
}

function toLocalAuthority(
  hit: KnowledgeArticleHit,
  document: StoredKnowledgeDocument,
  citation: DetectedExactCitation,
): LegalCorpusAuthority {
  const dotted = citation.paragraph
    ? `${citation.article}.${citation.paragraph}`
    : citation.article;
  const articleNumber = articleNumberOf(hit) || dotted;
  const sourceUrl =
    document.provenance?.originalUrl?.trim() ||
    hit.officialUrl?.trim() ||
    hit.sourceUrl?.trim() ||
    "";
  const sha = document.provenance?.sha256 ?? "";
  const archiveId = document.provenance?.archiveId ?? "";
  const sourceVersion = hit.sourceVersion?.trim() || null;
  const documentVersionId = sourceVersion || document.id;

  return {
    nodeId: hit.articleId,
    documentId: hit.documentId,
    documentVersionId,
    locator: citation.locator,
    title: hit.documentTitle,
    excerpt: hit.articleText,
    contentHash: sha,
    sourceContentHash: sha,
    parserId: LOCAL_LEGAL_SOURCE_TYPE,
    archiveRecordId: archiveId,
    effectiveFrom: hit.validFrom,
    effectiveTo: hit.validTo,
    sourceUrl: sourceUrl || null,
    sourceVersion,
    article: articleNumber || null,
    paragraph: citation.paragraph,
    sourceType: LOCAL_LEGAL_SOURCE_TYPE,
  };
}
