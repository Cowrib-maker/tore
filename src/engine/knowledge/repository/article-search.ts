/**
 * Deterministic article-level ranking for knowledge rule retrieval.
 * Shared by in-memory and Prisma repository adapters — no LLM, no invented text.
 */

import {
  KnowledgeMatchKind,
  type KnowledgeArticleHit,
  type KnowledgeArticleSearchQuery,
  type KnowledgeChunk,
  type StoredKnowledgeDocument,
} from "../types";

/**
 * Cyrillic titles must not rely on `\b` (JS word boundaries are ASCII-only
 * without the `u` flag), or domain filters silently fail and open search
 * falls back to unrelated Article-1 rows.
 */
const DOMAIN_TITLE_HINTS: Record<string, RegExp> = {
  CRIMINAL:
    /(criminal|эрүүгийн|гэмт\s*хэрэг|цагдаа|хорих|ял\s*ших|offense|offence|prosecut)/i,
  CIVIL:
    /(civil|иргэний|contract|гэрээ|obligation|tort|өмчийн|family|гэр\s*бүл)/i,
  ADMINISTRATIVE:
    /(administrative|захиргааны|agency|permit|licence|license|regulatory|тусгай\s*зөвшөөрөл)/i,
};

const DOMAIN_TITLE_TERMS: Record<string, readonly string[]> = {
  CRIMINAL: [
    "criminal",
    "эрүүгийн",
    "гэмт хэрэг",
    "цагдаа",
    "offense",
    "offence",
  ],
  CIVIL: ["civil", "иргэний", "contract", "гэрээ", "obligation"],
  ADMINISTRATIVE: [
    "administrative",
    "захиргааны",
    "agency",
    "permit",
    "licence",
    "license",
    "regulatory",
  ],
};

const DOMAIN_DOCUMENT_TYPES: Record<string, readonly string[]> = {
  CRIMINAL: ["CRIMINAL_CODE"],
  CIVIL: ["CONTRACT", "LABOR_LAW"],
  ADMINISTRATIVE: [],
};

/** Open-question citations below this score are treated as noise (prefer empty). */
export const MIN_OPEN_QUESTION_CITATION_SCORE = 0.72;

const SEARCH_STOPWORDS = new Set(
  [
    "байх",
    "байгаа",
    "байна",
    "болно",
    "болох",
    "хэрэгтэй",
    "хэрэгтэйюу",
    "юу",
    "хэрхэн",
    "яаж",
    "яагаад",
    "надад",
    "намайг",
    "миний",
    "би",
    "чи",
    "тэр",
    "энэ",
    "тэд",
    "тухай",
    "тухайд",
    "тухайгаа",
    "хэлэх",
    "асуух",
    "асуулт",
    "тусламж",
    "зөвлөгөө",
    "боломжтой",
    "боломж",
    "мөн",
    "бас",
    "гэсэн",
    "гэж",
    "гэхдээ",
    "эсвэл",
    "бөгөөд",
    "нь",
    "ийм",
    "тийм",
    "маш",
    "их",
    "бага",
    "the",
    "and",
    "for",
    "with",
    "what",
    "how",
    "can",
    "please",
    "help",
    "about",
    "tore",
    "legal",
    "ai",
  ].map((w) => w.toLowerCase()),
);

const UNOFFICIAL_TOKENS = ["COMMENTARY", "DOCTRINE", "OPINION", "LLM"] as const;
const NON_STATUTE_TOKENS = [
  ...UNOFFICIAL_TOKENS,
  "COURT",
  "DECISION",
  "JUDGMENT",
  "REGULATION",
  "RESOLUTION",
  "ORDER",
  "DECREE",
  "TREATY",
] as const;

function typeContainsToken(
  documentType: string,
  tokens: readonly string[],
): boolean {
  const upper = documentType.toUpperCase();
  return tokens.some((token) => upper.includes(token));
}

/**
 * Document types that must never become an official citation hit.
 * Commentary, doctrine notes, and model output are distinct from verified sources.
 *
 * Regulations, orders, resolutions, and court judgments ARE citable when
 * `officialSourceKinds` is `"all"`. Statute-only search still uses
 * {@link isPositiveLawDocumentType}.
 */
export function isCitableOfficialDocumentType(
  documentType: string | null,
): boolean {
  if (!documentType) return true;
  const upper = documentType.toUpperCase();
  if (upper === "AI" || upper.startsWith("AI_") || upper.endsWith("_AI")) {
    return false;
  }
  return !typeContainsToken(documentType, UNOFFICIAL_TOKENS);
}

/**
 * Court reasoning, commentary, regulations, and AI output are distinct from
 * positive law (codes and statutes). Used by doctrine rule mapping.
 */
export function isPositiveLawDocumentType(documentType: string | null): boolean {
  if (!documentType) return true;
  const upper = documentType.toUpperCase();
  if (upper === "AI" || upper.startsWith("AI_") || upper.endsWith("_AI")) {
    return false;
  }
  return !typeContainsToken(documentType, NON_STATUTE_TOKENS);
}

function allowsDocumentType(
  documentType: string | null,
  query: KnowledgeArticleSearchQuery,
): boolean {
  if (query.officialSourceKinds === "all") {
    return isCitableOfficialDocumentType(documentType);
  }
  return isPositiveLawDocumentType(documentType);
}

const ISSUE_KIND_TERMS: Record<string, RegExp> = {
  elements_of_offense: /\b(element|offense|offence|actus|charge)\b/i,
  unlawfulness: /\b(unlawful|illegal|wrongful)\b/i,
  culpability: /\b(intent|mens rea|negligen|reckless|culpab)\b/i,
  causation: /\b(caus|result|consequence)\b/i,
  attempt_or_participation: /\b(attempt|participat|aiding|abetting)\b/i,
  civil_obligation: /\b(obligat|contract|duty|debt)\b/i,
  breach: /\b(breach|default|non.?performance)\b/i,
  damages: /\b(damage|loss|compensat|harm)\b/i,
  administrative_legality: /\b(administrat|agency|permit|licence|license)\b/i,
  competence_or_jurisdiction: /\b(jurisdiction|competence|authority)\b/i,
  procedural_legality: /\b(procedure|procedural|hearing|notice)\b/i,
  evidence_or_admissibility: /\b(evidence|admissib|witness|proof)\b/i,
};

const ARTICLE_NUMBER_TOKEN = "([0-9]+(?:\\.[0-9]+)*[a-zA-Zа-яА-ЯёЁ]?)";

export function normalizeArticleNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match =
    trimmed.match(new RegExp(`(?:art(?:icle)?|зүйл)\\.?\\s*${ARTICLE_NUMBER_TOKEN}`, "i")) ??
    trimmed.match(new RegExp(`^${ARTICLE_NUMBER_TOKEN}$`));
  return match?.[1]?.toLowerCase() ?? trimmed.toLowerCase();
}

export function extractArticleNumberFromText(text: string): string | null {
  const match =
    text.match(new RegExp(`(?:art(?:icle)?|зүйл)\\.?\\s*${ARTICLE_NUMBER_TOKEN}`, "i")) ??
    text.match(
      /([0-9]+(?:\.[0-9]+)*)\s*(?:дүгээр|дугаар|дэх)?\s*зүйл/i,
    );
  return match?.[1]?.toLowerCase() ?? null;
}

export function domainFilterHints(domain: string | null | undefined): {
  documentTypes: readonly string[];
  titleTerms: readonly string[];
} {
  if (!domain) return { documentTypes: [], titleTerms: [] };
  const key = domain.toUpperCase();
  return {
    documentTypes: DOMAIN_DOCUMENT_TYPES[key] ?? [],
    titleTerms: DOMAIN_TITLE_TERMS[key] ?? [],
  };
}

export function documentMatchesDomain(
  document: Pick<StoredKnowledgeDocument, "title" | "metadata">,
  domain: string | null | undefined,
): boolean {
  if (!domain) return true;
  const key = domain.toUpperCase();
  const types = DOMAIN_DOCUMENT_TYPES[key];
  if (types && types.length > 0 && document.metadata.documentType) {
    if (types.includes(document.metadata.documentType)) return true;
  }
  const hint = DOMAIN_TITLE_HINTS[key];
  if (!hint) return true;
  const haystack = `${document.title} ${document.metadata.documentType ?? ""}`;
  return hint.test(haystack);
}

/**
 * Same open-ended bound rules as doctrine {@link isApplicableAt}.
 * Kept here so the knowledge layer does not import doctrine.
 */
export function isKnowledgeApplicableAt(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
  applicableAt: string | null | undefined,
): boolean {
  if (!applicableAt) return true;
  if (validFrom && applicableAt < validFrom) return false;
  if (validTo && applicableAt > validTo) return false;
  return true;
}

function articleIdFor(
  document: StoredKnowledgeDocument,
  article: StoredKnowledgeDocument["articles"][number],
): string {
  return article.id ?? `${document.id}:article:${article.order}`;
}

function pickChunk(
  document: StoredKnowledgeDocument,
  articleNumber: string | null,
): KnowledgeChunk | null {
  if (!articleNumber) {
    return document.chunks[0] ?? null;
  }
  const normalized = normalizeArticleNumber(articleNumber);
  return (
    document.chunks.find(
      (c) => normalizeArticleNumber(c.articleNumber) === normalized,
    ) ??
    document.chunks[0] ??
    null
  );
}

function scoreHit(input: {
  query: KnowledgeArticleSearchQuery;
  document: StoredKnowledgeDocument;
  article: StoredKnowledgeDocument["articles"][number];
  chunk: KnowledgeChunk | null;
}): { score: number; matchKind: KnowledgeMatchKind } | null {
  const { query, document, article, chunk } = input;
  if (!allowsDocumentType(document.metadata.documentType, query)) {
    return null;
  }
  if (!documentMatchesDomain(document, query.domain)) {
    return null;
  }
  if (
    !isKnowledgeApplicableAt(
      document.metadata.validFrom,
      document.metadata.validTo,
      query.applicableAt,
    )
  ) {
    return null;
  }

  const qText = (query.text ?? "").trim();
  const wantedArticle =
    normalizeArticleNumber(query.articleNumber) ??
    extractArticleNumberFromText(qText);
  const articleNum = normalizeArticleNumber(article.articleNumber);
  const articleBody = `${article.title ?? ""} ${article.text}`;
  const titleHay = `${document.title} ${article.title ?? ""}`;

  // 1. Article number / identifier — highest signal.
  if (wantedArticle && articleNum && wantedArticle === articleNum) {
    return { score: 1, matchKind: KnowledgeMatchKind.ARTICLE_NUMBER };
  }

  let score = 0;
  let matchKind: KnowledgeMatchKind = KnowledgeMatchKind.CHUNK;

  // 2. Legal concept terms in article text.
  const conceptTerms = tokenizeConcepts(qText);
  const bodyLower = articleBody.toLowerCase();
  const conceptHits = conceptTerms.filter((t) => bodyLower.includes(t));
  if (conceptHits.length >= 2) {
    score = Math.max(score, 0.78);
    matchKind = KnowledgeMatchKind.CONCEPT;
  } else if (conceptHits.length === 1 && (conceptHits[0]?.length ?? 0) >= 5) {
    score = Math.max(score, 0.72);
    matchKind = KnowledgeMatchKind.CONCEPT;
  }

  // 3. Issue-kind terms.
  if (query.issueKind) {
    const kindRe = ISSUE_KIND_TERMS[query.issueKind];
    if (kindRe?.test(articleBody) || kindRe?.test(qText)) {
      score = Math.max(score, 0.66);
      matchKind = KnowledgeMatchKind.ISSUE_KIND;
    }
  }

  // 4. Title.
  if (qText && titleHay.toLowerCase().includes(qText.toLowerCase())) {
    const titleScore =
      qText.length >= 12 || conceptTerms.length >= 2 ? 0.78 : 0.58;
    if (titleScore >= score) {
      score = titleScore;
      matchKind = KnowledgeMatchKind.TITLE;
    }
  } else if (score === 0 && conceptTerms.length > 0) {
    const titleLower = titleHay.toLowerCase();
    const hits = conceptTerms.filter((t) => titleLower.includes(t)).length;
    if (hits >= 2) {
      score = 0.7;
      matchKind = KnowledgeMatchKind.TITLE;
    } else if (hits === 1) {
      score = 0.58;
      matchKind = KnowledgeMatchKind.TITLE;
    }
  }

  // 5. Chunk text — supporting locator, not authority by itself.
  if (chunk && qText && chunk.text.toLowerCase().includes(qText.toLowerCase())) {
    if (score < 0.55) {
      score = Math.max(score, 0.5);
      matchKind = KnowledgeMatchKind.CHUNK;
    } else {
      score = Math.min(1, score + 0.05);
    }
  }

  // Domain-aligned statute titles are far more trustworthy than bare Article 1
  // matches from generic conversational tokens.
  if (query.domain && documentMatchesDomain(document, query.domain)) {
    const hint = DOMAIN_TITLE_HINTS[query.domain.toUpperCase()];
    if (hint?.test(document.title)) {
      score = Math.min(1, score + 0.12);
    }
  }

  if (
    matchKind !== KnowledgeMatchKind.ARTICLE_NUMBER &&
    (articleNum === "1" || articleNum === "1.1") &&
    score < 0.85
  ) {
    score *= 0.82;
  }

  if (score < 0.55) return null;
  return { score, matchKind };
}

function tokenizeConcepts(text: string): string[] {
  return tokenizeSearchTerms(text, 12);
}

/**
 * Infer a coarse legal domain from free-text questions.
 * Returns null when the domain is ambiguous — callers should then require
 * higher confidence rather than citing unrelated statutes.
 */
export function inferLegalDomainFromText(text: string): string | null {
  const hay = text.toLowerCase();
  if (
    /(эрүү|гэмт\s*хэрэг|цагдаа|хорих|ял\s*ших|сэжигл|баривчил|хэрэгтэн|хохирогч|гэрч|criminal|prosecut|offense|offence)/i.test(
      hay,
    )
  ) {
    return "CRIMINAL";
  }
  if (
    /(захиргаа|тусгай\s*зөвшөөрөл|лиценз|зөвшөөрөл|administrative|permit|licence|license)/i.test(
      hay,
    )
  ) {
    return "ADMINISTRATIVE";
  }
  if (
    /(иргэний\s*хууль|гэрээ|нэхэмжлэл|өр\b|зээл|гэрлэлт|тэтгэмж|өмч|civil|contract|tort)/i.test(
      hay,
    )
  ) {
    return "CIVIL";
  }
  return null;
}

/** Strip residual HTML chrome from scraped statute / judgment titles. */
export function stripLegalHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchTerms(text: string, limit = 6): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !SEARCH_STOPWORDS.has(t));

  // Prefer longer, more distinctive tokens (reduces Article-1 OR noise).
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of [...raw].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function rankDocumentsToHits(
  documents: readonly StoredKnowledgeDocument[],
  query: KnowledgeArticleSearchQuery,
): KnowledgeArticleHit[] {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const hits: KnowledgeArticleHit[] = [];

  for (const document of documents) {
    if (query.jurisdiction && document.metadata.jurisdiction !== query.jurisdiction) {
      continue;
    }
    if (query.sourceUrl && document.sourceUrl !== query.sourceUrl) {
      continue;
    }
    if (query.sourceId && document.sourceId !== query.sourceId) {
      continue;
    }
    if (
      query.documentType &&
      document.metadata.documentType !== query.documentType
    ) {
      continue;
    }
    if (
      !isKnowledgeApplicableAt(
        document.metadata.validFrom,
        document.metadata.validTo,
        query.applicableAt,
      )
    ) {
      continue;
    }

    const articles =
      document.articles.length > 0
        ? document.articles
        : chunksAsArticles(document);

    for (const article of articles) {
      const chunk = pickChunk(document, article.articleNumber);
      const scored = scoreHit({ query, document, article, chunk });
      if (!scored) continue;

      hits.push({
        documentId: document.id,
        sourceId: document.sourceId,
        sourceUrl: document.sourceUrl,
        officialUrl: document.provenance?.originalUrl ?? document.sourceUrl,
        documentTitle: document.title,
        documentType: document.metadata.documentType,
        jurisdiction: document.metadata.jurisdiction,
        lawId: document.provenance?.lawId ?? null,
        contentSha256:
          document.provenance?.contentSha256 ??
          document.provenance?.sha256 ??
          null,
        version: document.version ?? null,
        articleId: articleIdFor(document, article),
        articleNumber: article.articleNumber,
        articleTitle: article.title,
        articleText: article.text,
        chunkId: chunk?.id ?? null,
        chunkText: chunk?.text ?? null,
        matchKind: scored.matchKind,
        score: scored.score,
        validFrom: document.metadata.validFrom ?? null,
        validTo: document.metadata.validTo ?? null,
        sourceVersion: document.metadata.sourceVersion ?? null,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.articleId.localeCompare(b.articleId));
  return dedupeByArticle(hits).slice(0, limit);
}

function chunksAsArticles(
  document: StoredKnowledgeDocument,
): StoredKnowledgeDocument["articles"] {
  return document.chunks.map((chunk, index) => ({
    id: chunk.id,
    articleNumber: chunk.articleNumber,
    title: null,
    text: chunk.text,
    order: chunk.order ?? index,
  }));
}

function dedupeByArticle(hits: KnowledgeArticleHit[]): KnowledgeArticleHit[] {
  const seen = new Set<string>();
  const out: KnowledgeArticleHit[] = [];
  for (const hit of hits) {
    const key = `${hit.documentId}:${hit.articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/**
 * Narrow document set for in-memory search before article scoring.
 * Still local to the repository instance — not a full production corpus load.
 */
export function filterDocumentsForSearch(
  documents: readonly StoredKnowledgeDocument[],
  query: KnowledgeArticleSearchQuery,
): StoredKnowledgeDocument[] {
  return documents.filter((document) => {
    if (query.jurisdiction && document.metadata.jurisdiction !== query.jurisdiction) {
      return false;
    }
    if (query.sourceUrl && document.sourceUrl !== query.sourceUrl) {
      return false;
    }
    if (query.sourceId && document.sourceId !== query.sourceId) {
      return false;
    }
    if (query.documentType && document.metadata.documentType !== query.documentType) {
      return false;
    }
    if (query.lawId) {
      const documentLawId = document.provenance?.lawId?.trim() ?? "";
      if (documentLawId !== query.lawId) {
        return false;
      }
    }
    if (query.titleTerms?.length) {
      const title = document.title.toLowerCase();
      if (!query.titleTerms.some((term) => title.includes(term.toLowerCase()))) {
        return false;
      }
    }
    if (query.excludeTitleTerms?.length) {
      const title = document.title.toLowerCase();
      if (
        query.excludeTitleTerms.some((term) =>
          title.includes(term.toLowerCase()),
        )
      ) {
        return false;
      }
    }
    if (!allowsDocumentType(document.metadata.documentType, query)) {
      return false;
    }
    if (!documentMatchesDomain(document, query.domain)) {
      return false;
    }
    if (
      !isKnowledgeApplicableAt(
        document.metadata.validFrom,
        document.metadata.validTo,
        query.applicableAt,
      )
    ) {
      return false;
    }
    return true;
  });
}
