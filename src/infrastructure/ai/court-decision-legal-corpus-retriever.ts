/**
 * Court-decision tier for the Legal AI corpus retriever.
 *
 * Reuses the EXACT same search infrastructure as
 * {@link KnowledgeLegalCorpusRetriever} ({@link IKnowledgeRepository.searchArticles})
 * — the only material difference is scoping every query to
 * `documentType: "COURT_JUDGMENT"` and ranking results by how much of the
 * question's own wording (court name, aimag/city, case-number fragments)
 * overlaps the candidate's title, instead of the statute-tuned legal
 * concept/issue-kind scorer {@link KnowledgeLegalCorpusRetriever} relies on.
 *
 * Why this exists as its own tier rather than folding into
 * KnowledgeLegalCorpusRetriever: confirmed by direct testing against the
 * real local corpus that (a) KnowledgeLegalCorpusRetriever's open-question
 * path never passes `documentType`, so it does not reliably surface
 * judgments for natural-language questions at all, and (b) even scoped to
 * `documentType: "COURT_JUDGMENT"`, the raw concept-score ordering puts
 * judgments from the WRONG court ahead of the right one when their titles
 * share generic boilerplate ("Иргэний хэргийн давж заалдах шатны шүүх" is
 * common to many appellate courts) — title-overlap ranking fixes that
 * without touching the statute scorer other callers still depend on.
 *
 * Never invents a decision, court name, date, or case number: every
 * returned authority traces to a stored {@link StoredKnowledgeDocument}
 * with verified archive provenance (same gate as the local statute tier),
 * and a case number or court name that doesn't match anything ingested
 * simply returns no result rather than a guess.
 */
import type {
  LegalCitationVerifyResult,
  LegalCorpusAuthority,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { CitationVerificationStatus } from "@/application/ai/legal-corpus";
import { stripLegalHtmlTags } from "@/engine/knowledge/repository/article-search";
import type {
  IKnowledgeRepository,
  KnowledgeArticleHit,
  StoredKnowledgeDocument,
} from "@/engine/knowledge/types";

export const COURT_JUDGMENT_DOCUMENT_TYPE = "COURT_JUDGMENT";
export const COURT_LEGAL_SOURCE_TYPE = "court-decision";

const MAX_COURT_AUTHORITIES = 3;
/** Matches shuukh.mn printed decision numbers, e.g. "209/МА2026/00036" or
 * "307/2025/00401/и" (the "Хэргийн индекс" variant). Loose by design —
 * false positives just fall through to the ranked title-overlap search. */
const CASE_NUMBER_PATTERN = /\b\d{2,4}\/[a-zа-я]{1,4}\d{2,4}\/\d{3,6}(?:\/[a-zа-я])?\b/iu;

function unavailableNotFound(): LegalCorpusRetrieveResult {
  return { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null };
}

function extractCaseNumber(text: string): string | null {
  return text.match(CASE_NUMBER_PATTERN)?.[0] ?? null;
}

function hasVerifiedProvenance(
  document: StoredKnowledgeDocument | null,
): document is StoredKnowledgeDocument {
  const sha = document?.provenance?.sha256?.trim();
  const archiveId = document?.provenance?.archiveId?.trim();
  return Boolean(sha && archiveId);
}

/**
 * Generic legal/court-procedure vocabulary that appears in nearly every
 * statute title AND nearly every judgment title alike («... тухай хууль»,
 * «... шатны шүүх», «... хуулийн дагуу»). None of these distinguish one
 * document from another, so they must never count toward title-overlap —
 * an ordinary statute question ("Хөдөлмөрийн тухай хуулийн дагуу...") would
 * otherwise score a false boost against any judgment whose boilerplate
 * happens to repeat the same generic words, letting an unrelated judgment
 * outrank (or stand in for) the correctly-tuned statute tier below it.
 */
const TITLE_OVERLAP_STOPWORDS = new Set([
  "тухай",
  "хууль",
  "хуулийн",
  "хуультай",
  "дугаар",
  "дүгээр",
  "зүйл",
  "зүйлийн",
  "журам",
  "журмын",
  "заалт",
  "дагуу",
  "тогтоол",
  "шийдвэр",
  "шүүх",
  "шүүхийн",
  "хэргийн",
  "шатны",
  "анхан",
  "давж",
  "заалдах",
  "хяналтын",
]);

/** Question words (>=4 letters, excluding generic legal/court boilerplate)
 * or numeric fragments (>=2 digits) that literally appear in the
 * candidate's title — a deliberately simple, deterministic stand-in for the
 * statute scorer's concept matching, tuned for proper nouns (court/aimag
 * names) and case-number fragments instead of legal concepts. */
function titleOverlapBoost(title: string, questionText: string): number {
  const titleLower = title.toLowerCase();
  const tokens = new Set(
    questionText
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => (/^\d+$/.test(token) ? token.length >= 2 : token.length >= 4))
      .filter((token) => !TITLE_OVERLAP_STOPWORDS.has(token)),
  );
  let boost = 0;
  for (const token of tokens) {
    if (titleLower.includes(token)) boost += 1;
  }
  return boost;
}

function toCourtAuthority(
  hit: KnowledgeArticleHit,
  document: StoredKnowledgeDocument,
): LegalCorpusAuthority {
  const sourceUrl =
    document.provenance?.originalUrl?.trim() || hit.officialUrl?.trim() || hit.sourceUrl?.trim() || "";
  const sha = document.provenance?.sha256 ?? "";
  const archiveId = document.provenance?.archiveId ?? "";
  return {
    nodeId: hit.articleId,
    documentId: hit.documentId,
    documentVersionId: hit.documentId,
    locator: hit.articleNumber ?? hit.documentId,
    title: stripLegalHtmlTags(hit.documentTitle),
    excerpt: hit.chunkText ?? hit.articleText,
    contentHash: sha,
    sourceContentHash: sha,
    parserId: COURT_LEGAL_SOURCE_TYPE,
    archiveRecordId: archiveId,
    effectiveFrom: hit.validFrom,
    effectiveTo: hit.validTo,
    sourceUrl: sourceUrl || null,
    sourceVersion: hit.sourceVersion?.trim() || null,
    article: null,
    paragraph: null,
    sourceType: COURT_LEGAL_SOURCE_TYPE,
  };
}

export class CourtDecisionLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(private readonly knowledge: IKnowledgeRepository) {}

  async retrieveExactCitation(input: LegalCorpusRetrieveInput): Promise<LegalCorpusRetrieveResult> {
    const text = (input.query || input.question || "").trim();
    const caseNumber = extractCaseNumber(text);
    if (!caseNumber) return unavailableNotFound();

    const hits = await this.searchVerified(caseNumber, 5);
    const exact = hits.filter(
      (item) => item.hit.documentTitle.toLowerCase().includes(caseNumber.toLowerCase()),
    );
    // Only a single, unambiguous match counts as "exact" — more than one
    // document printing the same case-number-shaped token is a conflict,
    // not a guess as to which one the user meant.
    if (exact.length !== 1) return unavailableNotFound();
    return this.toRetrieveResult(exact);
  }

  async retrieveLegalQuestion(input: LegalCorpusRetrieveInput): Promise<LegalCorpusRetrieveResult> {
    const questionText = (input.question || input.query || "").trim();
    if (!questionText) return unavailableNotFound();

    const caseNumber = extractCaseNumber(questionText);
    if (caseNumber) {
      const exact = await this.retrieveExactCitation({ ...input, query: caseNumber });
      if (exact.kind === "retrieved") return exact;
    }

    const hits = await this.searchVerified(questionText, 10);
    if (hits.length === 0) return unavailableNotFound();

    const ranked = [...hits].sort((a, b) => {
      const boost =
        titleOverlapBoost(b.hit.documentTitle, questionText) -
        titleOverlapBoost(a.hit.documentTitle, questionText);
      if (boost !== 0) return boost;
      return b.hit.score - a.hit.score;
    });

    // A title-overlap boost of 0 means nothing in the question actually
    // matched this candidate's title — keeping it would be the raw
    // statute-style concept score standing in for relevance it doesn't
    // have for a judgment. Drop those rather than guess.
    const relevant = ranked.filter(
      (item) => titleOverlapBoost(item.hit.documentTitle, questionText) > 0,
    );
    if (relevant.length === 0) return unavailableNotFound();

    return this.toRetrieveResult(relevant.slice(0, MAX_COURT_AUTHORITIES));
  }

  async verifyCitation(input: LegalCorpusVerifyInput): Promise<LegalCitationVerifyResult> {
    const text = (input.query || input.question || "").trim();
    const caseNumber = extractCaseNumber(text) ?? text;
    if (!caseNumber) {
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

    const hits = await this.searchVerified(caseNumber, 5);
    const exact = hits.filter((item) =>
      item.hit.documentTitle.toLowerCase().includes(caseNumber.toLowerCase()),
    );

    if (exact.length === 0) {
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
    if (exact.length > 1) {
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

    const [match] = exact;
    const authority = toCourtAuthority(match!.hit, match!.document);
    if (input.nodeId && authority.nodeId !== input.nodeId) {
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
        nodeId: authority.nodeId,
        documentVersionId: authority.documentVersionId,
        locator: authority.locator,
        reasons: ["citation_unique", "local_provenance"],
      },
    };
  }

  /** Search scoped to COURT_JUDGMENT, hydrated with each hit's full stored
   * document, keeping only hits with verified archive provenance (same
   * anti-fabrication gate the local statute tier applies). */
  private async searchVerified(
    text: string,
    limit: number,
  ): Promise<Array<{ hit: KnowledgeArticleHit; document: StoredKnowledgeDocument }>> {
    const hits = await this.knowledge.searchArticles({
      text,
      jurisdiction: "MN",
      officialSourceKinds: "all",
      documentType: COURT_JUDGMENT_DOCUMENT_TYPE,
      limit,
    });
    if (hits.length === 0) return [];

    const documents = await this.knowledge.findByIds(hits.map((hit) => hit.documentId));
    const documentById = new Map(documents.map((document) => [document.id, document] as const));

    const out: Array<{ hit: KnowledgeArticleHit; document: StoredKnowledgeDocument }> = [];
    for (const hit of hits) {
      const document = documentById.get(hit.documentId);
      if (hasVerifiedProvenance(document ?? null)) {
        out.push({ hit, document: document! });
      }
    }
    return out;
  }

  private toRetrieveResult(
    items: ReadonlyArray<{ hit: KnowledgeArticleHit; document: StoredKnowledgeDocument }>,
  ): LegalCorpusRetrieveResult {
    if (items.length === 0) return unavailableNotFound();
    return {
      kind: "retrieved",
      status: "ok",
      authorities: items.map((item) => toCourtAuthority(item.hit, item.document)),
      retrievedAt: new Date().toISOString(),
    };
  }
}
