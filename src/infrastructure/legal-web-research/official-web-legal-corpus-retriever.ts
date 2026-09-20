/**
 * The third (last-resort) tier of the LegalCorpusRetriever chain: an exact
 * citation the local corpus and the internal engine both missed is looked
 * up live on legalinfo.mn — official, allowlisted, verified before it is
 * ever trusted as a legal authority.
 *
 * Scope is deliberately narrow, per the product requirement this
 * implements ("a verified Legal Source Retrieval layer, not generic web
 * search"): only `retrieveExactCitation`/`retrieveAndVerifyExactCitation`
 * do live work. `retrieveLegalQuestion` (open, non-exact questions) always
 * reports unavailable — this tier never free-text-searches the web.
 *
 * Pipeline for one exact citation:
 *   detectExactCitation → known lawId (canonical-law-titles.ts) or
 *   discoverLegalInfoLawByTitle (letter-filtered LegalInfo category scan,
 *   exact canonical-title match, refuses on ambiguity) → HttpKnowledgeCrawler
 *   fetch (HTTPS-only, legalinfo.mn-only, timeout + bounded retries — the
 *   same hardened crawler production ingestion uses) →
 *   extractVerifiedLegalInfoArticle (parse + confirm title AND article
 *   number both match AND the provision isn't struck through/repealed on
 *   the page) → temporal/version proof (evaluateVersionForTemporalQuery,
 *   same helper the local retriever uses) → best-effort
 *   cacheVerifiedWebDocument → LegalCorpusAuthority.
 *
 * The whole discovery+fetch sequence runs under one overall deadline
 * (`overallDeadlineMs`, default 12s) — per-call timeouts alone could
 * otherwise stack up to 24-36s across a multi-page discovery scan plus a
 * retried fetch, which risks the platform's own request/proxy timeout
 * killing the chat turn before this tier can even return its own honest
 * refusal. Exceeding the deadline is a plain `timeout` miss, same as any
 * single call timing out.
 *
 * Every exit that is not a full, verified match returns `unavailable` (or
 * `as_of_unavailable` for a proven-repealed/unprovable-version match),
 * never a guess — resolve-legal-authorities.ts's existing refusal
 * messages ("could not verify from an official source") already cover
 * that outcome honestly; this class does not invent new wording.
 */
import { contentSha256Hex, sha256Hex, type ArchiveService } from "@/engine/data/archive";
import {
  HttpKnowledgeCrawler,
  evaluateVersionForTemporalQuery,
  isLegalInfoHostname,
  legalInfoDetailUrl,
  parseLegalTemporalQueryIntent,
} from "@/engine/knowledge";
import type { FetchLike } from "@/engine/knowledge/crawler/http-knowledge-crawler";
import type { IKnowledgeRepository } from "@/engine/knowledge/types";
import { detectExactCitation, type DetectedExactCitation } from "@/engine/citation";
import { resolveCanonicalLawIdentity } from "@/engine/citation/canonical-law-titles";
import {
  CitationVerificationStatus,
  type LegalCitationVerifyResult,
  type LegalCorpusAuthority,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
  type LegalCorpusRetriever,
  type LegalCorpusUnavailableReason,
  type LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { consumeRateLimit } from "@/infrastructure/security/rate-limiter";
import { cacheVerifiedWebDocument } from "./cache-verified-web-document";
import { discoverLegalInfoLawByTitle } from "./legalinfo-title-discovery";
import { extractVerifiedLegalInfoArticle } from "./legalinfo-article-extraction";

export const LEGALINFO_LIVE_SOURCE_TYPE = "legalinfo-live";
const DEFAULT_RATE_LIMIT_KEY = "legal-web-retrieval:legalinfo:global";
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_OVERALL_DEADLINE_MS = 12_000;

export type OfficialWebLegalCorpusRetrieverOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxDiscoveryPages?: number;
  /**
   * Wall-clock budget for the ENTIRE discovery+fetch sequence of one
   * exact-citation lookup, independent of the per-call `timeoutMs`. Caps
   * worst-case latency for a miss so this tier can never block a chat
   * turn indefinitely (or past the platform's own request timeout) just
   * because several individual calls each stayed within their own
   * per-call timeout.
   */
  overallDeadlineMs?: number;
  /** Global (all callers) live-fetch budget per minute — protects legalinfo.mn, not a per-user limit. */
  rateLimitPerMinute?: number;
  /** Rate-limit bucket key. Override only for test isolation — production always uses the shared default. */
  rateLimitKey?: string;
  /**
   * When omitted, a successful live verification is never cached —
   * caching is optional, verification is not. A factory (not a resolved
   * value) so composition roots can defer the real archive stack's setup
   * (health checks etc.) until this retriever actually needs to write,
   * not at every process boot. Resolved at most once per instance.
   */
  cache?: () => Promise<{ archive: ArchiveService; repository: IKnowledgeRepository }>;
  now?: () => Date;
};

function unavailable(reason: LegalCorpusUnavailableReason): LegalCorpusRetrieveResult {
  return { kind: "unavailable", reason, authorities: [], retrievedAt: null };
}

function asOfUnavailable(): LegalCorpusRetrieveResult {
  return { kind: "as_of_unavailable", authorities: [], retrievedAt: null };
}

const DEADLINE_EXCEEDED = Symbol("deadline_exceeded");

/**
 * Races `work` against a plain timer. The underlying work is NOT
 * cancelled when the deadline wins (its per-call timeouts/AbortControllers
 * still apply on their own schedule) — this only bounds how long the
 * CALLER waits, which is what actually protects the chat turn.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof DEADLINE_EXCEEDED> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

export class OfficialWebLegalCorpusRetriever implements LegalCorpusRetriever {
  private readonly fetchImpl: FetchLike | undefined;
  private readonly timeoutMs: number;
  private readonly maxDiscoveryPages: number;
  private readonly overallDeadlineMs: number;
  private readonly rateLimitPerMinute: number;
  private readonly rateLimitKey: string;
  private readonly cacheFactory:
    | (() => Promise<{ archive: ArchiveService; repository: IKnowledgeRepository }>)
    | undefined;
  private cachePromise: Promise<{ archive: ArchiveService; repository: IKnowledgeRepository }> | undefined;
  private readonly now: () => Date;

  constructor(options: OfficialWebLegalCorpusRetrieverOptions = {}) {
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? 6000;
    this.maxDiscoveryPages = options.maxDiscoveryPages ?? 4;
    this.overallDeadlineMs = options.overallDeadlineMs ?? DEFAULT_OVERALL_DEADLINE_MS;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? 20;
    this.rateLimitKey = options.rateLimitKey ?? DEFAULT_RATE_LIMIT_KEY;
    this.cacheFactory = options.cache;
    this.now = options.now ?? (() => new Date());
  }

  async retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const { retrieved } = await this.retrieveAndVerifyExactCitation(input);
    return retrieved;
  }

  async retrieveLegalQuestion(
    _input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    // Deliberately out of scope — see file header. Never free-text-searches.
    return unavailable("not_found");
  }

  async verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    const { verification } = await this.retrieveAndVerifyExactCitation({
      question: input.question ?? input.query,
      query: input.query,
      locator: input.locator ?? null,
      explicitRelations: input.explicitRelations,
    });
    return verification;
  }

  async retrieveAndVerifyExactCitation(input: LegalCorpusRetrieveInput): Promise<{
    retrieved: LegalCorpusRetrieveResult;
    verification: LegalCitationVerifyResult;
  }> {
    const citation = detectExactCitation(input.query || input.question || "");
    if (!citation) {
      return this.missResult("not_found");
    }

    const rate = await consumeRateLimit(this.rateLimitKey, this.rateLimitPerMinute, RATE_LIMIT_WINDOW_MS);
    if (!rate.ok) {
      return this.missResult("network");
    }

    const fetchOutcome = await withDeadline(
      this.resolveCandidateAndFetch(citation.titleHint),
      this.overallDeadlineMs,
    );
    if (fetchOutcome === DEADLINE_EXCEEDED) {
      return this.missResult("timeout");
    }
    if (!fetchOutcome.ok) {
      return this.missResult(fetchOutcome.reason);
    }

    // Everything below is local CPU work on already-fetched bytes (parsing,
    // repeal/temporal checks) plus a best-effort cache write — none of it
    // is the network-bound discovery/fetch this deadline exists to bound,
    // so none of it can turn an already-verified answer into a spurious
    // timeout just because caching happens to be slow.
    return this.extractAndFinalize(citation, input, fetchOutcome.candidate, fetchOutcome.html);
  }

  /**
   * The network-bound half of one lookup: resolving which law to fetch
   * (possibly several discovery-page requests) and fetching its detail
   * page. Factored out so `retrieveAndVerifyExactCitation` can bound
   * exactly this under the overall deadline, without also racing the
   * caching step below it.
   */
  private async resolveCandidateAndFetch(titleHint: string): Promise<
    | { ok: true; candidate: { lawId: string; officialUrl: string }; html: string }
    | { ok: false; reason: LegalCorpusUnavailableReason }
  > {
    const candidate = await this.resolveCandidateLaw(titleHint);
    if (!candidate) {
      return { ok: false, reason: "not_found" };
    }
    const fetched = await this.fetchDetailPage(candidate.officialUrl);
    if (!fetched.ok) {
      return { ok: false, reason: fetched.reason };
    }
    return { ok: true, candidate, html: fetched.html };
  }

  private async extractAndFinalize(
    citation: DetectedExactCitation,
    input: LegalCorpusRetrieveInput,
    candidate: { lawId: string; officialUrl: string },
    html: string,
  ): Promise<{ retrieved: LegalCorpusRetrieveResult; verification: LegalCitationVerifyResult }> {
    const extracted = await extractVerifiedLegalInfoArticle({
      html,
      sourceUrl: candidate.officialUrl,
      titleHint: citation.titleHint,
      article: citation.article,
      paragraph: citation.paragraph,
    });
    if (extracted.kind === "not_found") {
      return this.missResult("not_found");
    }
    if (extracted.kind === "repealed") {
      // Real text, real document — but struck through as repealed on the
      // page itself. Never present it as current, applicable law.
      return { retrieved: asOfUnavailable(), verification: { ok: false, reason: "not_found" } };
    }
    const article = extracted.article;

    const temporalText = [input.question, input.query].filter((p) => p?.trim()).join(" ");
    const intent = parseLegalTemporalQueryIntent(temporalText);
    const nowIsoDate = this.now().toISOString().slice(0, 10);
    const proof = evaluateVersionForTemporalQuery(
      {
        validFrom: article.validFrom,
        validTo: article.validTo,
        lawId: candidate.lawId,
        explicitRelations: input.explicitRelations ?? [],
        title: article.documentTitle,
      },
      intent,
      nowIsoDate,
    );
    if (!proof.proven && intent.kind !== "UNSPECIFIED") {
      return { retrieved: asOfUnavailable(), verification: { ok: false, reason: "not_found" } };
    }

    const cacheFactory = this.cacheFactory;
    if (cacheFactory) {
      // Fire-and-forget by design, not merely best-effort: this must never
      // add latency to (or block) the citation answer below, and a cache
      // stack that hangs or is simply slow (a real DB/archive write) must
      // never be able to turn an already-verified answer into a spurious
      // failure. cacheVerifiedWebDocument() already catches its own
      // errors and never throws; the outer catch here only guards the
      // cache-stack setup (the factory call itself), and resets
      // `cachePromise` on failure so a transient setup failure gets
      // retried on the next citation rather than permanently disabling
      // caching for this retriever's lifetime.
      void (async () => {
        try {
          const cache = await (this.cachePromise ??= cacheFactory());
          await cacheVerifiedWebDocument({
            html,
            sourceUrl: candidate.officialUrl,
            lawId: candidate.lawId,
            archive: cache.archive,
            repository: cache.repository,
          });
        } catch {
          this.cachePromise = undefined;
        }
      })();
    }

    const bytes = new TextEncoder().encode(html);
    const contentHash = sha256Hex(bytes);
    const documentVersionId = contentSha256Hex(bytes);
    const nodeId = `legalinfo-live:${candidate.lawId}:${article.articleNumber}`;

    const authority: LegalCorpusAuthority = {
      nodeId,
      documentId: `legalinfo-live:${candidate.lawId}`,
      documentVersionId,
      locator: citation.locator,
      title: article.documentTitle,
      excerpt: article.text,
      contentHash,
      sourceContentHash: documentVersionId,
      parserId: LEGALINFO_LIVE_SOURCE_TYPE,
      archiveRecordId: "",
      effectiveFrom: article.validFrom,
      effectiveTo: article.validTo,
      sourceUrl: candidate.officialUrl,
      sourceVersion: null,
      article: article.articleNumber,
      paragraph: article.paragraphNumber,
      sourceType: LEGALINFO_LIVE_SOURCE_TYPE,
    };

    return {
      retrieved: {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: this.now().toISOString(),
      },
      verification: {
        ok: true,
        verdict: {
          query: input.query,
          status: CitationVerificationStatus.VALID,
          nodeId,
          documentVersionId,
          locator: citation.locator,
          reasons: ["citation_unique", "legalinfo_live_verified"],
        },
      },
    };
  }

  private missResult(reason: LegalCorpusUnavailableReason): {
    retrieved: LegalCorpusRetrieveResult;
    verification: LegalCitationVerifyResult;
  } {
    return { retrieved: unavailable(reason), verification: { ok: false, reason } };
  }

  private async resolveCandidateLaw(
    titleHint: string,
  ): Promise<{ lawId: string; officialUrl: string } | null> {
    const identity = resolveCanonicalLawIdentity({ titleHint });
    if (identity.preferredLawIds.length === 1) {
      const lawId = identity.preferredLawIds[0]!;
      return { lawId, officialUrl: legalInfoDetailUrl(lawId) };
    }

    const discovered = await discoverLegalInfoLawByTitle(titleHint, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxPages: this.maxDiscoveryPages,
    });
    // "ambiguous" (more than one canonically-matching law found) refuses
    // exactly like "not_found" — never guess which candidate was meant.
    if (discovered.kind !== "found") {
      return null;
    }
    return { lawId: discovered.law.lawId, officialUrl: discovered.law.officialUrl };
  }

  private async fetchDetailPage(
    officialUrl: string,
  ): Promise<{ ok: true; html: string } | { ok: false; reason: LegalCorpusUnavailableReason }> {
    let failureReason: LegalCorpusUnavailableReason = "network";
    const crawler = new HttpKnowledgeCrawler({
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxRetries: 1,
      onDocumentError: ({ error }) => {
        const message = error instanceof Error ? error.message : String(error);
        failureReason = message.toLowerCase().includes("timed out") ? "timeout" : "network";
      },
    });

    let documents;
    try {
      documents = await crawler.crawl({
        sourceId: "legalinfo-live",
        urls: [officialUrl],
        maxDocuments: 1,
      });
    } catch {
      return { ok: false, reason: "network" };
    }

    const document = documents[0];
    if (!document) {
      return { ok: false, reason: failureReason };
    }
    return { ok: true, html: new TextDecoder("utf-8").decode(document.bytes) };
  }
}

/** Re-exported for callers that only need the hostname check without constructing a retriever. */
export { isLegalInfoHostname };
