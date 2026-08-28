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

const DOMAIN_TITLE_HINTS: Record<string, RegExp> = {
  CRIMINAL: /\b(criminal|эрүүгийн|offense|offence|prosecut)\b/i,
  CIVIL: /\b(civil|иргэний|contract|гэрээ|obligation|tort|property)\b/i,
  ADMINISTRATIVE:
    /\b(administrative|захиргааны|agency|permit|licence|license|regulatory)\b/i,
};

const DOMAIN_TITLE_TERMS: Record<string, readonly string[]> = {
  CRIMINAL: ["criminal", "эрүүгийн", "offense", "offence"],
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

/**
 * Document types that must never become an authoritative legal-rule hit.
 * Court reasoning, commentary, doctrine notes, regulations, and AI output
 * are distinct from positive law.
 *
 * REGULATION exclusion is an existing product policy, isolated here.
 * Historical retrieval v0.2 does not change it; review separately before
 * grounding regulations, orders, or resolutions as positive law.
 */
const NON_POSITIVE_LAW =
  /\b(court|decision|judgment|commentary|doctrine|opinion|regulation|ai|llm)\b/i;

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

export function isPositiveLawDocumentType(documentType: string | null): boolean {
  if (!documentType) return true;
  return !NON_POSITIVE_LAW.test(documentType);
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
  if (!isPositiveLawDocumentType(document.metadata.documentType)) {
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
  if (conceptTerms.some((t) => articleBody.toLowerCase().includes(t))) {
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
    if (hits > 0) {
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

  if (score <= 0) return null;
  return { score, matchKind };
}

function tokenizeConcepts(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
}

export function tokenizeSearchTerms(text: string, limit = 6): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, limit);
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
    if (!isPositiveLawDocumentType(document.metadata.documentType)) {
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
