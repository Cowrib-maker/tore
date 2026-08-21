/**
 * Source-grounded LegalTest / element extraction from retrieved articles.
 *
 * Maps structure that already exists in positive-law text (enumerated clauses,
 * semicolon lists, or the article as a whole). Does not invent doctrine,
 * labels such as actus reus / mens rea, or elements that are not in the source.
 * Does not call an LLM.
 */

import { evaluateSourceBackedSupport } from "../provenance";
import { isApplicableAt } from "../temporal";
import {
  ElementExtractionKind,
  LegalAuthorityKind,
  LegalDomain,
  ReasoningSupportStatus,
  emptyTemporal,
  type LegalDomain as LegalDomainType,
} from "../types";
import type { LegalElement, LegalFact, LegalTest } from "../models";
import {
  DeterministicFactElementMapper,
  mappingIsAdequate,
} from "./fact-element-mapping";
import type { RetrievedLegalRule } from "./rule-retriever";
import { assertRuleSupported } from "./rule-retriever";

export type LegalTestExtractionQuery = {
  applicableAt: string;
  domain?: LegalDomainType | string | null;
};

/**
 * {@link LegalTest} plus article-level provenance and extraction metadata.
 */
export type ExtractedLegalTest = LegalTest & {
  domain: LegalDomainType | null;
  sourceId: string;
  sourceUrl: string | null;
  officialUrl: string | null;
  legalDocumentId: string | null;
  articleId: string | null;
  articleNumber: string | null;
  chunkId: string | null;
  extractionStatus: (typeof ReasoningSupportStatus)[keyof typeof ReasoningSupportStatus];
  extractionKind: ElementExtractionKind;
  notes: string[];
};

export interface ILegalTestExtractor {
  extract(
    rule: RetrievedLegalRule,
    query: LegalTestExtractionQuery,
  ): ExtractedLegalTest;
}

const MIN_CLAUSE_CHARS = 8;
const MIN_WHOLE_ARTICLE_CHARS = 20;
const MAX_ELEMENTS = 20;

/** Markers for 1-based lists. Article numbers such as "15." are dropped later. */
const LIST_MARKER =
  /(?:^|[\n;]|\s)((?:\d{1,2}[.)])|(?:\([0-9]{1,2}\))|(?:\([a-zа-яё]\))|(?:[a-zа-яё][.)]))\s+/giu;

/**
 * Deterministic extractor. Positive-law text in, candidate test out.
 */
export class SourceGroundedLegalTestExtractor implements ILegalTestExtractor {
  extract(
    rule: RetrievedLegalRule,
    query: LegalTestExtractionQuery,
  ): ExtractedLegalTest {
    const base = emptyExtracted(rule, query);

    try {
      assertRuleSupported(rule);
    } catch {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
        extractionKind: ElementExtractionKind.NONE,
        notes: ["rule lacks authoritative provenance — refusing to invent elements"],
      };
    }

    if (rule.supportStatus !== ReasoningSupportStatus.SOURCE_BACKED) {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
        extractionKind: ElementExtractionKind.NONE,
        notes: [
          `rule supportStatus=${rule.supportStatus} is not SOURCE_BACKED — not extracting an authoritative test`,
        ],
      };
    }

    if (!isApplicableAt(rule.temporal, query.applicableAt)) {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
        extractionKind: ElementExtractionKind.NONE,
        notes: ["rule is outside applicableAt — refusing to extract a current-version test"],
      };
    }

    const onlyPositiveLaw = rule.rule.provenance.every(
      (p) => p.sourceKind === LegalAuthorityKind.POSITIVE_LAW,
    );
    if (!onlyPositiveLaw || rule.rule.provenance.length === 0) {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
        extractionKind: ElementExtractionKind.NONE,
        notes: ["only POSITIVE_LAW provenance may produce a legal test"],
      };
    }

    const articleText = resolveArticleText(rule);
    if (!articleText) {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.INCOMPLETE,
        extractionKind: ElementExtractionKind.NONE,
        notes: ["no article text available — cannot extract elements"],
      };
    }

    const enumerated = splitEnumerated(articleText);
    const listed = enumerated.length >= 2 ? enumerated : splitSemicolonList(articleText);

    let kind: ElementExtractionKind = ElementExtractionKind.NONE;
    let clauses: ExtractedClause[] = [];
    if (enumerated.length >= 2) {
      kind = ElementExtractionKind.ENUMERATED;
      clauses = enumerated;
    } else if (listed.length >= 2) {
      kind = ElementExtractionKind.CONJUNCTIVE_LIST;
      clauses = listed;
    } else if (articleText.trim().length >= MIN_WHOLE_ARTICLE_CHARS) {
      kind = ElementExtractionKind.WHOLE_ARTICLE;
      clauses = [
        {
          marker: rule.articleNumber ? `art.${rule.articleNumber}` : "article",
          text: articleText.trim(),
        },
      ];
    }

    if (clauses.length === 0) {
      return {
        ...base,
        extractionStatus: ReasoningSupportStatus.INCOMPLETE,
        extractionKind: ElementExtractionKind.NONE,
        notes: ["article text has no extractable source-grounded clauses"],
      };
    }

    const elements = clauses.slice(0, MAX_ELEMENTS).map((clause, index) =>
      toElement(rule, query, clause, index + 1),
    );

    const provenance = rule.rule.provenance.map((p) => ({ ...p }));
    const support = evaluateSourceBackedSupport("legal_rule", provenance, {
      required: true,
    });

    return {
      ...base,
      name: testName(rule),
      elements,
      provenance,
      extractionKind: kind,
      extractionStatus:
        support.status === ReasoningSupportStatus.SOURCE_BACKED
          ? ReasoningSupportStatus.SOURCE_BACKED
          : ReasoningSupportStatus.UNSUPPORTED,
      notes: [
        `extractionKind=${kind}`,
        `${elements.length} element(s) copied from article text`,
      ],
    };
  }
}

/** Default that never invents a test. */
export class EmptyLegalTestExtractor implements ILegalTestExtractor {
  extract(
    rule: RetrievedLegalRule,
    query: LegalTestExtractionQuery,
  ): ExtractedLegalTest {
    return {
      ...emptyExtracted(rule, query),
      extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
      extractionKind: ElementExtractionKind.NONE,
      notes: ["test extractor not configured"],
    };
  }
}

type ExtractedClause = {
  marker: string;
  text: string;
};

function emptyExtracted(
  rule: RetrievedLegalRule,
  query: LegalTestExtractionQuery,
): ExtractedLegalTest {
  const domain = resolveDomain(query.domain);
  return {
    id: `test:extracted:${rule.articleId ?? rule.rule.id}`,
    name: testName(rule),
    doctrineId: null,
    ruleId: rule.rule.id,
    domain,
    sourceId: rule.sourceId,
    sourceUrl: rule.sourceUrl,
    officialUrl: rule.officialUrl,
    legalDocumentId: rule.legalDocumentId,
    articleId: rule.articleId,
    articleNumber: rule.articleNumber,
    chunkId: rule.chunkId,
    elements: [],
    temporal: emptyTemporal({
      validFrom: rule.temporal.validFrom,
      validTo: rule.temporal.validTo,
      sourceVersion: rule.temporal.sourceVersion,
      applicableAt: query.applicableAt,
    }),
    provenance: [],
    extractionStatus: ReasoningSupportStatus.UNSUPPORTED,
    extractionKind: ElementExtractionKind.NONE,
    notes: [],
  };
}

function resolveDomain(
  domain: LegalDomainType | string | null | undefined,
): LegalDomainType | null {
  if (!domain) return null;
  const key = String(domain).toUpperCase();
  if (key === LegalDomain.CRIMINAL) return LegalDomain.CRIMINAL;
  if (key === LegalDomain.CIVIL) return LegalDomain.CIVIL;
  if (key === LegalDomain.ADMINISTRATIVE) return LegalDomain.ADMINISTRATIVE;
  return null;
}

function testName(rule: RetrievedLegalRule): string {
  if (rule.title?.trim()) return rule.title.trim();
  if (rule.articleNumber) return `Article ${rule.articleNumber}`;
  return rule.rule.id;
}

function resolveArticleText(rule: RetrievedLegalRule): string {
  const explicit = rule.articleText?.trim();
  if (explicit) return explicit;
  const statement = rule.rule.statement.trim();
  const newline = statement.indexOf("\n");
  if (newline >= 0) {
    return statement.slice(newline + 1).trim();
  }
  return statement;
}

function splitEnumerated(text: string): ExtractedClause[] {
  return selectSequentialClauses(splitByMarkerRegex(text, LIST_MARKER));
}

function splitByMarkerRegex(text: string, regex: RegExp): ExtractedClause[] {
  const re = new RegExp(regex.source, regex.flags);
  const hits: Array<{ index: number; marker: string; bodyStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const marker = (match[1] ?? match[0]).trim();
    hits.push({
      index: match.index,
      marker,
      bodyStart: match.index + match[0].length,
    });
  }
  if (hits.length < 2) return [];

  const clauses: ExtractedClause[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.bodyStart;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : text.length;
    const body = sanitizeClause(text.slice(start, end));
    if (body.length < MIN_CLAUSE_CHARS) continue;
    clauses.push({ marker: hits[i]!.marker, text: body });
  }
  return clauses;
}

function selectSequentialClauses(clauses: ExtractedClause[]): ExtractedClause[] {
  if (clauses.length < 2) return [];
  const start = clauses.findIndex((c) => markerStartsSequence(c.marker));
  if (start < 0) return [];
  const run = [clauses[start]!];
  for (let i = start + 1; i < clauses.length; i++) {
    const prev = parseMarkerOrder(run[run.length - 1]!.marker);
    const next = parseMarkerOrder(clauses[i]!.marker);
    if (prev == null || next == null || next !== prev + 1) break;
    run.push(clauses[i]!);
  }
  return run.length >= 2 ? run : [];
}

function markerStartsSequence(marker: string): boolean {
  const order = parseMarkerOrder(marker);
  return order === 1;
}

function parseMarkerOrder(marker: string): number | null {
  const digits = marker.match(/(\d{1,2})/);
  if (digits) return Number(digits[1]);
  const letter = marker.match(/([a-zа-яё])/iu)?.[1]?.toLowerCase();
  if (!letter) return null;
  if (letter >= "a" && letter <= "z") {
    return letter.charCodeAt(0) - 96;
  }
  const cyrillic = "абвгдежзийклмнопрстуфхцчшщъыьэюя";
  const idx = cyrillic.indexOf(letter);
  return idx >= 0 ? idx + 1 : null;
}

function splitSemicolonList(text: string): ExtractedClause[] {
  const colon = text.indexOf(":");
  if (colon < 0 || colon > text.length - 12) return [];
  const after = text.slice(colon + 1).trim();
  const parts = after
    .split(/\s*;\s*/)
    .map((part) => sanitizeClause(part.replace(/\s+(and|or|ба|бөгөөд|буюу|эсхүл)\s*$/i, "")))
    .filter((part) => part.length >= MIN_CLAUSE_CHARS);
  if (parts.length < 2) return [];
  return parts.map((part, index) => ({
    marker: String(index + 1),
    text: part,
  }));
}

function sanitizeClause(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/^[.;:—–-]+\s*/, "").trim();
}

function toElement(
  rule: RetrievedLegalRule,
  query: LegalTestExtractionQuery,
  clause: ExtractedClause,
  order: number,
): LegalElement {
  const articleKey = rule.articleId ?? rule.rule.id;
  const locator = [
    rule.articleNumber ? `art.${rule.articleNumber}` : rule.articleId,
    clause.marker,
  ]
    .filter(Boolean)
    .join("/");

  return {
    id: `el:${articleKey}:${order}`,
    label: clauseLabel(clause),
    description: clause.text,
    required: true,
    order,
    conceptId: null,
    temporal: emptyTemporal({
      validFrom: rule.temporal.validFrom,
      validTo: rule.temporal.validTo,
      sourceVersion: rule.temporal.sourceVersion,
      applicableAt: query.applicableAt,
    }),
    provenance: rule.rule.provenance.map((p) => ({
      ...p,
      locator,
    })),
  };
}

function clauseLabel(clause: ExtractedClause): string {
  const first = clause.text.split(/(?<=[.。])\s/)[0] ?? clause.text;
  const clipped = first.length > 80 ? `${first.slice(0, 80)}…` : first;
  return `${clause.marker} ${clipped}`.trim();
}

/**
 * Compatibility helper: stamp adequate mappings onto fact.elementId.
 * Prefer {@link DeterministicFactElementMapper} for auditable mappings.
 */
export function bindFactsToElements(
  facts: readonly LegalFact[],
  elements: readonly LegalElement[],
  applicableAt?: string,
): LegalFact[] {
  if (elements.length === 0) return [...facts];
  const at =
    applicableAt ??
    elements[0]?.temporal.applicableAt ??
    "9999-12-31";
  const mapped = new DeterministicFactElementMapper().map({
    facts,
    elements,
    evidence: [],
    applicableAt: at,
  });
  const firstByFact = new Map<string, string>();
  const allByFact = new Map<string, string[]>();
  for (const mapping of mapped.mappings) {
    if (!mappingIsAdequate(mapping)) continue;
    if (!firstByFact.has(mapping.factId)) {
      firstByFact.set(mapping.factId, mapping.elementId);
    }
    const ids = allByFact.get(mapping.factId) ?? [];
    ids.push(mapping.elementId);
    allByFact.set(mapping.factId, ids);
  }
  return facts.map((fact) => {
    if (fact.elementId) return fact;
    const elementId = firstByFact.get(fact.id);
    if (!elementId) return fact;
    return {
      ...fact,
      elementId,
      elementIds: allByFact.get(fact.id),
    };
  });
}

export function createLegalTestExtractor(): ILegalTestExtractor {
  return new SourceGroundedLegalTestExtractor();
}
