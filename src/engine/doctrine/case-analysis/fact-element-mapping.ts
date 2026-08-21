/**
 * Deterministic, auditable Fact → LegalElement mapping.
 *
 * Explicit/manual assignments are preserved. Lexical mapping uses token and
 * phrase overlap only — no LLM, no semantic guessing, no invented doctrine.
 */

import { isApplicableAt } from "../temporal";
import {
  FactElementRelation,
  MappingConfidence,
  MappingMethod,
  SubsumptionMatchStatus,
  type FactElementRelation as FactElementRelationType,
  type MappingConfidence as MappingConfidenceType,
  type MappingMethod as MappingMethodType,
  type TemporalApplicability,
} from "../types";
import type { LegalElement, LegalEvidence, LegalFact } from "../models";

export type MappingProvenance = {
  recordedBy: "caller" | "lexical-mapper";
  applicableAt: string;
};

export type FactElementMapping = {
  id: string;
  factId: string;
  elementId: string;
  relation: FactElementRelationType;
  confidence: MappingConfidenceType;
  method: MappingMethodType;
  factText: string;
  elementSourceText: string;
  explanation: string;
  evidenceIds: string[];
  provenance: MappingProvenance;
};

export type ExplicitFactMappingInput = {
  factId: string;
  elementId: string;
  relation?: FactElementRelationType;
  method?: typeof MappingMethod.EXPLICIT | typeof MappingMethod.MANUAL;
  explanation?: string;
  /** Optional exhibit ids; must belong to the fact. */
  evidenceIds?: readonly string[];
};

export type FactMappingInput = {
  facts: readonly LegalFact[];
  elements: readonly LegalElement[];
  evidence: readonly LegalEvidence[];
  applicableAt: string;
  testTemporal?: TemporalApplicability | null;
  explicitMappings?: readonly ExplicitFactMappingInput[];
};

export type FactMappingResult = {
  mappings: FactElementMapping[];
  unmappedFactIds: string[];
  notes: string[];
};

export interface IFactElementMapper {
  map(input: FactMappingInput): FactMappingResult;
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "that",
  "this",
  "these",
  "those",
  "with",
  "from",
  "by",
  "as",
  "at",
  "it",
  "its",
  "if",
  "then",
  "than",
  "not",
  "no",
  "nor",
  "required",
  "shall",
  "must",
  "may",
  "when",
  "who",
  "which",
  "into",
]);

const NEGATION =
  /\b(not|no|never|without|cannot|can't|didn't|did not|does not|wasn't|is not|are not|failed to|denied|neither)\b/i;

/** Adequacy: LOW lexical mappings cannot satisfy a required element. */
export function mappingIsAdequate(mapping: FactElementMapping): boolean {
  if (
    mapping.method === MappingMethod.EXPLICIT ||
    mapping.method === MappingMethod.MANUAL
  ) {
    return true;
  }
  return (
    mapping.method === MappingMethod.LEXICAL &&
    (mapping.confidence === MappingConfidence.HIGH ||
      mapping.confidence === MappingConfidence.MEDIUM)
  );
}

export class DeterministicFactElementMapper implements IFactElementMapper {
  map(input: FactMappingInput): FactMappingResult {
    const notes: string[] = [];
    if (
      input.testTemporal &&
      !isApplicableAt(input.testTemporal, input.applicableAt)
    ) {
      return {
        mappings: [],
        unmappedFactIds: input.facts.map((f) => f.id),
        notes: ["legal test is not applicable at applicableAt — no mappings"],
      };
    }

    const elements = input.elements.filter((element) =>
      isApplicableAt(element.temporal, input.applicableAt),
    );
    if (elements.length === 0 && input.elements.length > 0) {
      notes.push("no elements applicable at applicableAt — mappings rejected");
      return {
        mappings: [],
        unmappedFactIds: input.facts.map((f) => f.id),
        notes,
      };
    }

    const byId = new Map(elements.map((e) => [e.id, e]));
    const factsById = new Map(input.facts.map((f) => [f.id, f]));
    const seen = new Set<string>();
    const mappings: FactElementMapping[] = [];

    const push = (mapping: FactElementMapping | null): void => {
      if (!mapping) return;
      const key = `${mapping.factId}::${mapping.elementId}`;
      if (seen.has(key)) return;
      seen.add(key);
      mappings.push(mapping);
    };

    for (const explicit of input.explicitMappings ?? []) {
      const fact = factsById.get(explicit.factId);
      const element = byId.get(explicit.elementId);
      if (!fact || !element) {
        notes.push(
          `explicit mapping dropped: unknown fact or inapplicable element (${explicit.factId} → ${explicit.elementId})`,
        );
        continue;
      }
      push(
        buildMapping({
          fact,
          element,
          evidence: input.evidence,
          applicableAt: input.applicableAt,
          relation:
            explicit.relation ??
            fact.mappingRelation ??
            FactElementRelation.SUPPORTS,
          confidence: MappingConfidence.HIGH,
          method: explicit.method ?? MappingMethod.EXPLICIT,
          explanation:
            explicit.explanation ??
            `Caller assigned fact ${fact.id} to element ${element.id}.`,
          recordedBy: "caller",
          evidenceIds: explicit.evidenceIds,
        }),
      );
    }

    for (const fact of input.facts) {
      const assigned = collectAssignedElementIds(fact);
      const method =
        fact.mappingMethod === MappingMethod.MANUAL
          ? MappingMethod.MANUAL
          : MappingMethod.EXPLICIT;
      for (const elementId of assigned) {
        const element = byId.get(elementId);
        if (!element) {
          notes.push(
            `explicit fact.elementId dropped: ${fact.id} → ${elementId} (unknown or inapplicable)`,
          );
          continue;
        }
        push(
          buildMapping({
            fact,
            element,
            evidence: input.evidence,
            applicableAt: input.applicableAt,
            relation: fact.mappingRelation ?? FactElementRelation.SUPPORTS,
            confidence: MappingConfidence.HIGH,
            method,
            explanation: `${method} assignment of fact ${fact.id} to element ${element.id}.`,
            recordedBy: "caller",
          }),
        );
      }
    }

    for (const fact of input.facts) {
      for (const element of elements) {
        const key = `${fact.id}::${element.id}`;
        if (seen.has(key)) continue;
        const lexical = scoreLexical(fact.statement, element.description);
        if (!lexical) continue;
        push(
          buildMapping({
            fact,
            element,
            evidence: input.evidence,
            applicableAt: input.applicableAt,
            relation: lexical.relation,
            confidence: lexical.confidence,
            method: MappingMethod.LEXICAL,
            explanation: lexical.explanation,
            recordedBy: "lexical-mapper",
          }),
        );
      }
    }

    const mappedFacts = new Set(mappings.map((m) => m.factId));
    const unmappedFactIds = input.facts
      .filter((f) => !mappedFacts.has(f.id))
      .map((f) => f.id);

    return { mappings, unmappedFactIds, notes };
  }
}

export function createFactElementMapper(): IFactElementMapper {
  return new DeterministicFactElementMapper();
}

function collectAssignedElementIds(fact: LegalFact): string[] {
  const ids = [
    ...(fact.elementId ? [fact.elementId] : []),
    ...(fact.elementIds ?? []),
  ];
  return [...new Set(ids)];
}

function belongingEvidenceIds(
  factId: string,
  evidence: readonly LegalEvidence[],
  requested?: readonly string[],
): string[] {
  const belonging = evidence
    .filter((e) => e.factId === factId)
    .map((e) => e.id);
  if (!requested || requested.length === 0) {
    return belonging;
  }
  const allowed = new Set(belonging);
  return requested.filter((id) => allowed.has(id));
}

function buildMapping(input: {
  fact: LegalFact;
  element: LegalElement;
  evidence: readonly LegalEvidence[];
  applicableAt: string;
  relation: FactElementRelationType;
  confidence: MappingConfidenceType;
  method: MappingMethodType;
  explanation: string;
  recordedBy: MappingProvenance["recordedBy"];
  evidenceIds?: readonly string[];
}): FactElementMapping {
  return {
    id: `map:${input.fact.id}:${input.element.id}`,
    factId: input.fact.id,
    elementId: input.element.id,
    relation: input.relation,
    confidence: input.confidence,
    method: input.method,
    factText: input.fact.statement,
    elementSourceText: input.element.description,
    explanation: input.explanation,
    evidenceIds: belongingEvidenceIds(
      input.fact.id,
      input.evidence,
      input.evidenceIds,
    ),
    provenance: {
      recordedBy: input.recordedBy,
      applicableAt: input.applicableAt,
    },
  };
}

export function tokenizeContent(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

function longestPhraseOverlap(factTokens: string[], elementTokens: string[]): number {
  const max = Math.min(factTokens.length, elementTokens.length);
  for (let n = max; n >= 2; n--) {
    const needles = new Set<string>();
    for (let i = 0; i <= elementTokens.length - n; i++) {
      needles.add(elementTokens.slice(i, i + n).join(" "));
    }
    for (let i = 0; i <= factTokens.length - n; i++) {
      if (needles.has(factTokens.slice(i, i + n).join(" "))) {
        return n;
      }
    }
  }
  return 0;
}

function scoreLexical(
  factText: string,
  elementText: string,
): {
  relation: FactElementRelationType;
  confidence: MappingConfidenceType;
  explanation: string;
} | null {
  const factTokens = tokenizeContent(factText);
  const elementTokens = tokenizeContent(elementText);
  if (elementTokens.length === 0 || factTokens.length === 0) return null;

  const factSet = new Set(factTokens);
  const hits = elementTokens.filter((t) => factSet.has(t));
  const uniqueHits = [...new Set(hits)];
  const ratio = uniqueHits.length / elementTokens.length;
  const phraseN = longestPhraseOverlap(factTokens, elementTokens);
  const negated = NEGATION.test(factText);

  let confidence: MappingConfidenceType | null = null;
  if (phraseN >= 3 || (ratio >= 0.75 && uniqueHits.length >= 3) || ratio === 1) {
    confidence = MappingConfidence.HIGH;
  } else if (phraseN >= 2 || (ratio >= 0.5 && uniqueHits.length >= 2)) {
    confidence = MappingConfidence.MEDIUM;
  } else if (ratio >= 0.3 && uniqueHits.length >= 1) {
    confidence = MappingConfidence.LOW;
  }
  if (!confidence) return null;

  const relation = negated
    ? FactElementRelation.NEGATES
    : FactElementRelation.SUPPORTS;
  const explanation = [
    `LEXICAL ${confidence}: ${uniqueHits.length}/${elementTokens.length} content tokens overlap`,
    phraseN >= 2 ? `shared ${phraseN}-token phrase` : null,
    negated ? "negation marker in fact text" : null,
    `tokens=[${uniqueHits.slice(0, 8).join(", ")}]`,
  ]
    .filter(Boolean)
    .join("; ");

  return { relation, confidence, explanation };
}

export type ElementMappingEvaluation = {
  element: LegalElement;
  status: (typeof SubsumptionMatchStatus)[keyof typeof SubsumptionMatchStatus];
  mappingIds: string[];
  supportingFactIds: string[];
  negatingFactIds: string[];
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
  explanation: string;
};

export function evaluateElementMappings(
  element: LegalElement,
  mappings: readonly FactElementMapping[],
  facts: readonly LegalFact[],
): ElementMappingEvaluation {
  const related = mappings.filter((m) => m.elementId === element.id);
  const factsById = new Map(facts.map((f) => [f.id, f]));

  if (related.length === 0) {
    return {
      element,
      status: SubsumptionMatchStatus.NOT_EVALUATED,
      mappingIds: [],
      supportingFactIds: [],
      negatingFactIds: [],
      supportingEvidenceIds: [],
      counterEvidenceIds: [],
      explanation: "No mapping to this element.",
    };
  }

  const adequate = related.filter(mappingIsAdequate);
  const onlyLowLexical =
    adequate.length === 0 &&
    related.every(
      (m) =>
        m.method === MappingMethod.LEXICAL &&
        m.confidence === MappingConfidence.LOW,
    );
  if (onlyLowLexical) {
    return {
      element,
      status: SubsumptionMatchStatus.NOT_EVALUATED,
      mappingIds: related.map((m) => m.id),
      supportingFactIds: [],
      negatingFactIds: [],
      supportingEvidenceIds: [],
      counterEvidenceIds: [],
      explanation:
        "Only LOW-confidence lexical mappings — insufficient to evaluate the element.",
    };
  }

  const supports = adequate.filter(
    (m) => m.relation === FactElementRelation.SUPPORTS,
  );
  const negates = adequate.filter(
    (m) => m.relation === FactElementRelation.NEGATES,
  );
  const uncertain = adequate.filter(
    (m) => m.relation === FactElementRelation.UNCERTAIN,
  );

  const supportingFactIds = [...new Set(supports.map((m) => m.factId))];
  const negatingFactIds = [...new Set(negates.map((m) => m.factId))];
  const supportingEvidenceIds = [
    ...new Set(supports.flatMap((m) => m.evidenceIds)),
  ];
  const counterEvidenceIds = [
    ...new Set(negates.flatMap((m) => m.evidenceIds)),
  ];
  const mappingIds = related.map((m) => m.id);

  if (supports.length > 0 && negates.length > 0) {
    return {
      element,
      status: SubsumptionMatchStatus.UNCERTAIN,
      mappingIds,
      supportingFactIds,
      negatingFactIds,
      supportingEvidenceIds,
      counterEvidenceIds,
      explanation:
        "Conflicting SUPPORTS and NEGATES mappings — not selecting either silently.",
    };
  }

  if (uncertain.length > 0 && supports.length === 0 && negates.length === 0) {
    return {
      element,
      status: SubsumptionMatchStatus.UNCERTAIN,
      mappingIds,
      supportingFactIds,
      negatingFactIds,
      supportingEvidenceIds,
      counterEvidenceIds,
      explanation: "Mappings marked UNCERTAIN only.",
    };
  }

  if (negates.length > 0) {
    return {
      element,
      status: SubsumptionMatchStatus.NOT_SATISFIED,
      mappingIds,
      supportingFactIds,
      negatingFactIds,
      supportingEvidenceIds,
      counterEvidenceIds,
      explanation: "Adequate NEGATES mapping(s) and no SUPPORTS mapping.",
    };
  }

  if (supports.length > 0) {
    const disputed = supportingFactIds.some(
      (id) => factsById.get(id)?.disputed,
    );
    if (disputed) {
      return {
        element,
        status: SubsumptionMatchStatus.UNCERTAIN,
        mappingIds,
        supportingFactIds,
        negatingFactIds,
        supportingEvidenceIds,
        counterEvidenceIds,
        explanation: "Supporting fact(s) are disputed.",
      };
    }
    if (supportingEvidenceIds.length === 0) {
      return {
        element,
        status: SubsumptionMatchStatus.UNCERTAIN,
        mappingIds,
        supportingFactIds,
        negatingFactIds,
        supportingEvidenceIds: [],
        counterEvidenceIds,
        explanation:
          "SUPPORTS mapping(s) exist but no linked evidence — evidence is required to prove the fact, not the element.",
      };
    }
    return {
      element,
      status: SubsumptionMatchStatus.SATISFIED,
      mappingIds,
      supportingFactIds,
      negatingFactIds,
      supportingEvidenceIds,
      counterEvidenceIds,
      explanation:
        "Adequate SUPPORTS mapping(s) with linked evidence; no NEGATES mapping.",
    };
  }

  return {
    element,
    status: SubsumptionMatchStatus.NOT_EVALUATED,
    mappingIds,
    supportingFactIds,
    negatingFactIds,
    supportingEvidenceIds,
    counterEvidenceIds,
    explanation: "No adequate SUPPORTS or NEGATES mapping.",
  };
}
