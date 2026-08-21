/**
 * Pure presentation helpers for CaseAnalysisReview.
 * Does not compute legal conclusions — only filters, highlights, and validates UI input.
 */

import {
  ConclusionDisposition,
  FactElementRelation,
  MappingMethod,
  ReasoningSupportStatus,
  SubsumptionMatchStatus,
} from "@/engine/doctrine";
import type {
  CaseAnalysisReview,
  CaseReviewWorkspacePayload,
} from "@/engine/doctrine";

export const TRACE_KINDS = [
  "ISSUE",
  "RULE",
  "ARTICLE",
  "LEGAL_TEST",
  "ELEMENT",
  "FACT",
  "EVIDENCE",
  "MAPPING",
  "SUBSUMPTION",
  "CONCLUSION",
] as const;

export type TraceKind = (typeof TRACE_KINDS)[number];

export type TraceSelection = {
  kind: TraceKind;
  id: string;
};

export const ELEMENT_STATUSES = [
  SubsumptionMatchStatus.SATISFIED,
  SubsumptionMatchStatus.NOT_SATISFIED,
  SubsumptionMatchStatus.UNCERTAIN,
  SubsumptionMatchStatus.NOT_EVALUATED,
] as const;

export const MAPPING_RELATIONS = [
  FactElementRelation.SUPPORTS,
  FactElementRelation.NEGATES,
  FactElementRelation.UNCERTAIN,
  FactElementRelation.IRRELEVANT,
] as const;

export type ManualMappingDraft = {
  factId: string;
  elementId: string;
  relation: string;
  evidenceIds: string[];
};

export type ManualMappingValidation =
  | { ok: true; draft: ManualMappingDraft }
  | { ok: false; error: string };

export function reviewTraceId(kind: TraceKind, id: string): string {
  return `${kind}:${id}`;
}

export function isAuthoritativeRule(
  rule: CaseAnalysisReview["rules"][number],
): boolean {
  return (
    rule.supportStatus === ReasoningSupportStatus.SOURCE_BACKED &&
    Boolean(rule.sourceId || rule.sourceUrl || rule.legalDocumentId)
  );
}

export function primaryConclusion(
  review: CaseAnalysisReview,
): CaseAnalysisReview["conclusions"][number] | null {
  return review.conclusions[0] ?? null;
}

export function analysisStatus(review: CaseAnalysisReview): string {
  return primaryConclusion(review)?.disposition ?? "NO_ANALYSIS";
}

export function blockingElements(
  review: CaseAnalysisReview,
): CaseAnalysisReview["elements"] {
  const conclusion = primaryConclusion(review);
  if (!conclusion || conclusion.disposition === ConclusionDisposition.SUPPORTED) {
    return [];
  }
  return review.elements.filter(
    (el) =>
      el.required &&
      el.status !== SubsumptionMatchStatus.SATISFIED,
  );
}

export function factsForElement(
  review: CaseAnalysisReview,
  elementId: string | null,
): CaseAnalysisReview["facts"] {
  if (!elementId) return review.facts;
  const factIds = new Set(
    review.mappings
      .filter((m) => m.elementId === elementId)
      .map((m) => m.factId),
  );
  return review.facts.filter((f) => factIds.has(f.id));
}

export function mappingsForIssue(
  review: CaseAnalysisReview,
  issueId: string | null,
): CaseAnalysisReview["mappings"] {
  if (!issueId) return review.mappings;
  const issue = review.issues.find((i) => i.id === issueId);
  if (!issue) return [];
  return review.mappings;
}

export function evidenceForFact(
  review: CaseAnalysisReview,
  factId: string,
): CaseAnalysisReview["evidence"] {
  return review.evidence.filter((e) => e.factId === factId);
}

export function mappingsForElement(
  review: CaseAnalysisReview,
  elementId: string,
): CaseAnalysisReview["mappings"] {
  return review.mappings.filter((m) => m.elementId === elementId);
}

export function supportingFactIdsForElement(
  review: CaseAnalysisReview,
  elementId: string,
): string[] {
  return [
    ...new Set(
      mappingsForElement(review, elementId)
        .filter((m) => m.relation === FactElementRelation.SUPPORTS)
        .map((m) => m.factId),
    ),
  ];
}

export function negatingFactIdsForElement(
  review: CaseAnalysisReview,
  elementId: string,
): string[] {
  return [
    ...new Set(
      mappingsForElement(review, elementId)
        .filter((m) => m.relation === FactElementRelation.NEGATES)
        .map((m) => m.factId),
    ),
  ];
}

export function evidenceIdsForElement(
  review: CaseAnalysisReview,
  elementId: string,
): string[] {
  return [
    ...new Set(mappingsForElement(review, elementId).flatMap((m) => m.evidenceIds)),
  ];
}

export function unresolvedNotesForElement(
  review: CaseAnalysisReview,
  elementId: string,
): string[] {
  const application = review.subsumption.find((s) => s.element.id === elementId);
  const element = review.elements.find((e) => e.id === elementId);
  const notes: string[] = [];
  if (
    element?.status === SubsumptionMatchStatus.UNCERTAIN ||
    element?.status === SubsumptionMatchStatus.NOT_EVALUATED
  ) {
    notes.push(`Element status: ${element.status}`);
  }
  if (application?.explanation) {
    notes.push(application.explanation);
  }
  return notes;
}

export function relatedHighlightIds(
  review: CaseAnalysisReview,
  selection: TraceSelection | null,
): Set<string> {
  const ids = new Set<string>();
  if (!selection) return ids;

  const add = (kind: TraceKind, id: string | null | undefined) => {
    if (id) ids.add(reviewTraceId(kind, id));
  };

  const addIssueChain = () => {
    for (const issue of review.issues) add("ISSUE", issue.id);
    for (const rule of review.rules) {
      add("RULE", rule.id);
      add("ARTICLE", rule.articleId ?? rule.id);
    }
    for (const test of review.tests) add("LEGAL_TEST", test.id);
    for (const el of review.elements) {
      add("ELEMENT", el.id);
      add("SUBSUMPTION", el.id);
    }
    for (const fact of review.facts) add("FACT", fact.id);
    for (const ev of review.evidence) add("EVIDENCE", ev.id);
    for (const mapping of review.mappings) add("MAPPING", mapping.id);
    const conclusion = primaryConclusion(review);
    if (conclusion) add("CONCLUSION", conclusion.disposition);
  };

  switch (selection.kind) {
    case "ISSUE": {
      const issue = review.issues.find((i) => i.id === selection.id);
      if (issue) addIssueChain();
      break;
    }
    case "RULE":
    case "ARTICLE": {
      const rule = review.rules.find(
        (r) => r.id === selection.id || r.articleId === selection.id,
      );
      if (!rule) break;
      add("RULE", rule.id);
      add("ARTICLE", rule.articleId ?? rule.id);
      for (const test of review.tests) {
        if (!test.ruleId || test.ruleId === rule.id) add("LEGAL_TEST", test.id);
      }
      for (const el of review.elements) add("ELEMENT", el.id);
      break;
    }
    case "LEGAL_TEST": {
      add("LEGAL_TEST", selection.id);
      const test = review.tests.find((t) => t.id === selection.id);
      if (test?.ruleId) {
        add("RULE", test.ruleId);
        const rule = review.rules.find((r) => r.id === test.ruleId);
        add("ARTICLE", rule?.articleId ?? test.ruleId);
      }
      for (const el of review.elements) add("ELEMENT", el.id);
      break;
    }
    case "ELEMENT":
    case "SUBSUMPTION": {
      add("ELEMENT", selection.id);
      add("SUBSUMPTION", selection.id);
      for (const mapping of mappingsForElement(review, selection.id)) {
        add("MAPPING", mapping.id);
        add("FACT", mapping.factId);
        for (const evId of mapping.evidenceIds) add("EVIDENCE", evId);
      }
      for (const test of review.tests) add("LEGAL_TEST", test.id);
      break;
    }
    case "FACT": {
      add("FACT", selection.id);
      for (const ev of evidenceForFact(review, selection.id)) {
        add("EVIDENCE", ev.id);
      }
      for (const mapping of review.mappings.filter((m) => m.factId === selection.id)) {
        add("MAPPING", mapping.id);
        add("ELEMENT", mapping.elementId);
        add("SUBSUMPTION", mapping.elementId);
      }
      break;
    }
    case "EVIDENCE": {
      add("EVIDENCE", selection.id);
      const evidence = review.evidence.find((e) => e.id === selection.id);
      if (evidence) {
        add("FACT", evidence.factId);
        for (const mapping of review.mappings.filter((m) => m.factId === evidence.factId)) {
          add("MAPPING", mapping.id);
          add("ELEMENT", mapping.elementId);
        }
      }
      break;
    }
    case "MAPPING": {
      const mapping = review.mappings.find((m) => m.id === selection.id);
      if (!mapping) break;
      add("MAPPING", mapping.id);
      add("FACT", mapping.factId);
      add("ELEMENT", mapping.elementId);
      add("SUBSUMPTION", mapping.elementId);
      for (const evId of mapping.evidenceIds) add("EVIDENCE", evId);
      break;
    }
    case "CONCLUSION": {
      add("CONCLUSION", selection.id);
      for (const el of blockingElements(review)) {
        add("ELEMENT", el.id);
        add("SUBSUMPTION", el.id);
      }
      for (const issue of review.issues) add("ISSUE", issue.id);
      break;
    }
    default:
      break;
  }

  return ids;
}

export function parseEvidenceIds(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

export function validateManualMapping(
  review: CaseAnalysisReview,
  draft: {
    factId: string;
    elementId: string;
    relation: string;
    evidenceIds?: string[] | string;
  },
  catalog?: {
    facts?: ReadonlyArray<{ id: string }>;
    evidence?: ReadonlyArray<{ id: string; factId: string }>;
  },
): ManualMappingValidation {
  const factId = draft.factId.trim();
  const elementId = draft.elementId.trim();
  const relation = draft.relation.trim();
  const evidenceIds = Array.isArray(draft.evidenceIds)
    ? draft.evidenceIds.map((id) => id.trim()).filter(Boolean)
    : parseEvidenceIds(draft.evidenceIds ?? "");
  const facts = catalog?.facts ?? review.facts;
  const evidenceList = catalog?.evidence ?? review.evidence;

  if (!factId) {
    return { ok: false, error: "Select a fact." };
  }
  if (!elementId) {
    return { ok: false, error: "Select a target element." };
  }
  if (!facts.some((f) => f.id === factId)) {
    return { ok: false, error: "Unknown fact." };
  }
  if (!review.elements.some((e) => e.id === elementId)) {
    return { ok: false, error: "Unknown element." };
  }
  if (
    !MAPPING_RELATIONS.includes(
      relation as (typeof MAPPING_RELATIONS)[number],
    )
  ) {
    return {
      ok: false,
      error: "Relation must be SUPPORTS, NEGATES, UNCERTAIN, or IRRELEVANT.",
    };
  }

  for (const evidenceId of evidenceIds) {
    const matches = evidenceList.filter((e) => e.id === evidenceId);
    if (matches.length === 0) {
      return { ok: false, error: `Unknown evidence ${evidenceId}.` };
    }
    if (!matches.some((e) => e.factId === factId)) {
      return {
        ok: false,
        error: `Evidence ${evidenceId} does not belong to fact ${factId}.`,
      };
    }
  }

  return {
    ok: true,
    draft: { factId, elementId, relation, evidenceIds },
  };
}

export function isCaseAnalysisReview(value: unknown): value is CaseAnalysisReview {
  if (!value || typeof value !== "object") return false;
  const review = value as Record<string, unknown>;
  return (
    Array.isArray(review.issues) &&
    Array.isArray(review.rules) &&
    Array.isArray(review.tests) &&
    Array.isArray(review.elements) &&
    Array.isArray(review.facts) &&
    Array.isArray(review.evidence) &&
    Array.isArray(review.mappings) &&
    Array.isArray(review.subsumption) &&
    Array.isArray(review.conclusions)
  );
}

export function emptyCaseAnalysisReview(): CaseAnalysisReview {
  return {
    issues: [],
    rules: [],
    tests: [],
    elements: [],
    facts: [],
    evidence: [],
    mappings: [],
    subsumption: [],
    conclusions: [],
  };
}

export function isCaseAnalysisRequest(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    Array.isArray(request.facts) &&
    Array.isArray(request.evidence) &&
    typeof request.applicableAt === "string" &&
    request.applicableAt.trim().length > 0
  );
}

export function isCaseReviewWorkspacePayload(
  value: unknown,
): value is CaseReviewWorkspacePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.caseId === "string" &&
    typeof payload.title === "string" &&
    typeof payload.domain === "string" &&
    (payload.analyzedAt === null || typeof payload.analyzedAt === "string") &&
    typeof payload.applicableAt === "string" &&
    typeof payload.status === "string" &&
    typeof payload.version === "number" &&
    Array.isArray(payload.caseFacts) &&
    Array.isArray(payload.caseEvidence) &&
    isCaseAnalysisReview(payload.review)
  );
}

export function reviewErrorState(review: CaseAnalysisReview | null): string | null {
  if (!review) return "malformed";
  if (review.issues.length === 0) return "no-issues";
  if (review.rules.length === 0) return "no-rule";
  if (review.tests.length === 0) return "no-legal-test";
  const conclusion = primaryConclusion(review);
  if (conclusion?.disposition === ConclusionDisposition.INSUFFICIENT_FACTS) {
    return "insufficient-facts";
  }
  if (conclusion?.disposition === ConclusionDisposition.CONFLICTING_AUTHORITY) {
    return "conflicting-authority";
  }
  return null;
}

export function sourceUnavailable(rule: CaseAnalysisReview["rules"][number]): boolean {
  return !rule.sourceUrl && !rule.officialUrl;
}

export function formatValidityPeriod(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
): string {
  if (!validFrom && !validTo) return "Validity period not recorded";
  return `${validFrom ?? "—"} → ${validTo ?? "open"}`;
}

export function isManualMethod(method: string): boolean {
  return method === MappingMethod.MANUAL;
}
