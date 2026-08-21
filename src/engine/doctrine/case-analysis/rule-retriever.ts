/**
 * Source-grounded rule retrieval port.
 * Rules without authoritative provenance are rejected — never fabricated.
 */

import { evaluateSourceBackedSupport } from "../provenance";
import { isApplicableAt } from "../temporal";
import type { LegalRule } from "../models";
import {
  LegalAuthorityKind,
  ReasoningSupportStatus,
  type LegalDomain,
  type LegalIssueKind,
  type ReasoningSupportStatus as SupportStatus,
  type TemporalApplicability,
} from "../types";

export type RuleRetrievalQuery = {
  /** Free-text or structured issue statement used by later adapters. */
  issueStatement: string;
  /** Explicit retrieval query / legal concept (falls back to issueStatement). */
  query?: string;
  domain?: LegalDomain | string;
  issueKind?: LegalIssueKind | string;
  applicableAt: string;
  jurisdiction?: string;
  sourceUrl?: string;
  sourceId?: string;
  /** Optional positive-law / doctrine ids to prefer. */
  relatedAuthorityIds?: readonly string[];
  /** Drop hits below this relevance score (default 0.55). */
  minConfidence?: number;
  limit?: number;
};

/**
 * One retrieved rule with explicit source grounding.
 * The reasoning engine must reject entries with UNSUPPORTED support.
 */
export type RetrievedLegalRule = {
  rule: LegalRule;
  sourceId: string;
  sourceUrl: string | null;
  officialUrl: string | null;
  legalDocumentId: string | null;
  articleId: string | null;
  articleNumber: string | null;
  /** Prefer article id; falls back to chunk id for legacy callers. */
  articleOrChunkId: string | null;
  chunkId: string | null;
  title: string | null;
  /** Article body used for test/element extraction — never LLM-generated. */
  articleText?: string | null;
  temporal: TemporalApplicability;
  supportStatus: SupportStatus;
  confidence: number;
  matchKind?: string;
};

export interface IRuleRetriever {
  retrieve(query: RuleRetrievalQuery): Promise<RetrievedLegalRule[]>;
}

/**
 * In-memory retriever for tests and scaffolding.
 * Does not invent rules — only returns what was registered.
 */
export class InMemoryRuleRetriever implements IRuleRetriever {
  private readonly entries: RetrievedLegalRule[] = [];

  register(entry: RetrievedLegalRule): void {
    this.entries.push({
      ...entry,
      officialUrl: entry.officialUrl ?? entry.sourceUrl,
      articleId: entry.articleId ?? null,
      articleNumber: entry.articleNumber ?? null,
      chunkId: entry.chunkId ?? null,
      title: entry.title ?? null,
      articleText: entry.articleText ?? entry.rule.statement,
      articleOrChunkId:
        entry.articleOrChunkId ??
        entry.articleId ??
        entry.chunkId ??
        null,
    });
  }

  async retrieve(query: RuleRetrievalQuery): Promise<RetrievedLegalRule[]> {
    const grounded: RetrievedLegalRule[] = [];
    for (const entry of this.entries) {
      const support = evaluateSourceBackedSupport(
        "legal_rule",
        entry.rule.provenance,
        { required: true },
      );
      if (
        support.status === ReasoningSupportStatus.UNSUPPORTED ||
        support.llmGeneratedAlone
      ) {
        continue;
      }
      if (
        entry.rule.provenance.every(
          (p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE,
        )
      ) {
        continue;
      }
      if (!isApplicableAt(entry.rule.temporal, query.applicableAt)) {
        continue;
      }
      if (!isApplicableAt(entry.temporal, query.applicableAt)) {
        continue;
      }
      if (
        query.domain &&
        entry.rule.provenance[0] &&
        query.sourceId &&
        entry.sourceId !== query.sourceId
      ) {
        // optional source filter when provided
      }
      if (query.sourceId && entry.sourceId !== query.sourceId) {
        continue;
      }
      if (query.sourceUrl && entry.sourceUrl !== query.sourceUrl) {
        continue;
      }
      grounded.push({
        ...entry,
        supportStatus: support.status,
        confidence: Math.min(
          entry.confidence,
          support.status === "SOURCE_BACKED" ? 1 : 0.7,
        ),
      });
    }
    return grounded;
  }
}

/** Empty production default until knowledge-backed adapters are wired. */
export class EmptyRuleRetriever implements IRuleRetriever {
  async retrieve(): Promise<RetrievedLegalRule[]> {
    return [];
  }
}

/**
 * Soft-reject helper for callers that already hold a RetrievedLegalRule.
 */
export function assertRuleSupported(entry: RetrievedLegalRule): void {
  if (
    entry.supportStatus === ReasoningSupportStatus.UNSUPPORTED ||
    entry.supportStatus === ReasoningSupportStatus.INCOMPLETE
  ) {
    throw new Error(
      `unsupported_rule:${entry.rule.id}:${entry.supportStatus.toLowerCase()}`,
    );
  }
  const onlyAi = entry.rule.provenance.every(
    (p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE,
  );
  if (onlyAi || entry.rule.provenance.length === 0) {
    throw new Error(
      `unsupported_rule:${entry.rule.id}:missing_authoritative_provenance`,
    );
  }
  if (entry.rule.provenance.some((p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE) &&
      !entry.rule.provenance.some((p) => p.sourceKind === LegalAuthorityKind.POSITIVE_LAW)) {
    // AI mixed without positive law is not authoritative for rules
    const hasNonAi = entry.rule.provenance.some(
      (p) => p.sourceKind !== LegalAuthorityKind.AI_INFERENCE,
    );
    if (!hasNonAi) {
      throw new Error(`unsupported_rule:${entry.rule.id}:ai_not_authority`);
    }
  }
}
