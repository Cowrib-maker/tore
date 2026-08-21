/**
 * Knowledge-backed {@link IRuleRetriever}.
 *
 * Maps ingested LegalInfo articles/chunks into source-grounded
 * {@link RetrievedLegalRule} records. Never invents articles, doctrine,
 * or citations. Never treats LLM output as legal authority.
 */

import type { IKnowledgeRepository } from "@/engine/knowledge/types";
import { KnowledgeMatchKind } from "@/engine/knowledge/types";
import {
  extractArticleNumberFromText,
  normalizeArticleNumber,
} from "@/engine/knowledge/repository/article-search";
import { filterApplicableAt, isApplicableAt } from "../temporal";
import {
  LegalAuthorityKind,
  LegalDomain,
  ReasoningSupportStatus,
  emptyTemporal,
} from "../types";
import type {
  IRuleRetriever,
  RetrievedLegalRule,
  RuleRetrievalQuery,
} from "./rule-retriever";

export type KnowledgeRuleRetrieverOptions = {
  /** Minimum relevance score to surface (default 0.55). */
  minConfidence?: number;
  /**
   * Minimum score (or exact article-number match) required to mark a hit
   * SOURCE_BACKED. Weaker matches stay PARTIAL and cannot conclude.
   */
  authoritativeMinScore?: number;
  /** Max rules returned (default 10). */
  limit?: number;
};

/** Weak text overlap is never treated as an authoritative legal rule. */
export const KNOWLEDGE_AUTHORITATIVE_MIN_SCORE = 0.72;

/**
 * Production-oriented retriever over {@link IKnowledgeRepository}.
 * Positive law only — court decisions / commentary / AI are excluded upstream.
 */
export class KnowledgeRuleRetriever implements IRuleRetriever {
  private readonly minConfidence: number;
  private readonly authoritativeMinScore: number;
  private readonly limit: number;

  constructor(
    private readonly knowledge: IKnowledgeRepository,
    options: KnowledgeRuleRetrieverOptions = {},
  ) {
    this.minConfidence = options.minConfidence ?? 0.55;
    this.authoritativeMinScore =
      options.authoritativeMinScore ?? KNOWLEDGE_AUTHORITATIVE_MIN_SCORE;
    this.limit = options.limit ?? 10;
  }

  async retrieve(query: RuleRetrievalQuery): Promise<RetrievedLegalRule[]> {
    const text = (query.query ?? query.issueStatement ?? "").trim();
    const articleNumber =
      normalizeArticleNumber(
        extractArticleNumberFromText(text) ?? undefined,
      ) ?? null;

    const hits = await this.knowledge.searchArticles({
      text: text || undefined,
      articleNumber,
      domain: query.domain ?? null,
      issueKind: query.issueKind ?? null,
      jurisdiction: query.jurisdiction ?? null,
      sourceUrl: query.sourceUrl ?? null,
      sourceId: query.sourceId ?? null,
      applicableAt: query.applicableAt,
      limit: query.limit ?? this.limit,
    });

    const minConfidence = query.minConfidence ?? this.minConfidence;
    const retrievedAt = new Date().toISOString();
    const mapped: RetrievedLegalRule[] = [];

    for (const hit of hits) {
      if (hit.score < minConfidence) {
        continue;
      }
      if (!hit.sourceId || !hit.sourceUrl || !hit.articleId) {
        continue;
      }

      const temporal = emptyTemporal({
        validFrom: hit.validFrom,
        validTo: hit.validTo,
        sourceVersion: hit.sourceVersion,
        applicableAt: query.applicableAt,
      });

      if (!isApplicableAt(temporal, query.applicableAt)) {
        continue;
      }

      const supportStatus = this.supportStatusFor(hit.score, hit.matchKind);
      const provenance = [
        {
          sourceId: hit.sourceId,
          sourceKind: LegalAuthorityKind.POSITIVE_LAW,
          citation: [
            hit.documentTitle,
            hit.articleNumber ? `art. ${hit.articleNumber}` : null,
          ]
            .filter(Boolean)
            .join(" — "),
          locator: hit.articleNumber
            ? `art.${hit.articleNumber}`
            : hit.articleId,
          archivedRef: hit.contentSha256 ?? undefined,
          checksum: hit.contentSha256 ?? undefined,
          retrievedAt,
        },
      ];

      const ruleId = `rule:knowledge:${hit.documentId}:${hit.articleId}`;
      const statement = buildRuleStatement(hit);

      const retrieved: RetrievedLegalRule = {
        rule: {
          id: ruleId,
          statement,
          doctrineId: null,
          positiveLawRef: hit.lawId ?? hit.documentId,
          temporal,
          provenance,
        },
        sourceId: hit.sourceId,
        sourceUrl: hit.sourceUrl,
        officialUrl: hit.officialUrl || hit.sourceUrl,
        legalDocumentId: hit.documentId,
        articleId: hit.articleId,
        articleNumber: hit.articleNumber,
        articleOrChunkId: hit.articleId ?? hit.chunkId,
        chunkId: hit.chunkId,
        title: hit.articleTitle ?? hit.documentTitle,
        articleText: hit.articleText,
        temporal,
        supportStatus,
        confidence: hit.score,
        matchKind: hit.matchKind,
      };

      if (
        query.relatedAuthorityIds &&
        query.relatedAuthorityIds.length > 0 &&
        hit.lawId &&
        query.relatedAuthorityIds.includes(hit.lawId)
      ) {
        retrieved.confidence = Math.min(1, retrieved.confidence + 0.05);
      }

      mapped.push(retrieved);
    }

    const applicable = filterApplicableAt(mapped, query.applicableAt);
    applicable.sort((a, b) => b.confidence - a.confidence);
    return applicable.slice(0, query.limit ?? this.limit);
  }

  private supportStatusFor(
    score: number,
    matchKind: string | undefined,
  ): (typeof ReasoningSupportStatus)[keyof typeof ReasoningSupportStatus] {
    if (
      matchKind === KnowledgeMatchKind.ARTICLE_NUMBER ||
      score >= this.authoritativeMinScore
    ) {
      return ReasoningSupportStatus.SOURCE_BACKED;
    }
    return ReasoningSupportStatus.PARTIAL;
  }
}

function buildRuleStatement(hit: {
  documentTitle: string;
  articleNumber: string | null;
  articleTitle: string | null;
  articleText: string;
}): string {
  const header = [
    hit.documentTitle,
    hit.articleNumber ? `Article ${hit.articleNumber}` : null,
    hit.articleTitle,
  ]
    .filter(Boolean)
    .join(" — ");
  const body = hit.articleText.trim();
  const clipped = body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
  return `${header}\n${clipped}`.trim();
}

export function resolveKnowledgeDomain(
  domain: string | undefined,
): (typeof LegalDomain)[keyof typeof LegalDomain] | undefined {
  if (!domain) return undefined;
  const key = domain.toUpperCase();
  if (key === LegalDomain.CRIMINAL) return LegalDomain.CRIMINAL;
  if (key === LegalDomain.CIVIL) return LegalDomain.CIVIL;
  if (key === LegalDomain.ADMINISTRATIVE) return LegalDomain.ADMINISTRATIVE;
  return undefined;
}
