/**
 * Controlled official-web-source classification and provider port —
 * proposed as part of the "authoritative legal source retrieval + web
 * source fallback" architecture audit, Phases 3 and 6.
 *
 * NOT wired into legal-ai.service.ts / resolve-legal-authorities.ts /
 * create-legal-ai-service.ts. There is currently no live web-fetch
 * abstraction anywhere in the chat request path (confirmed by exhaustive
 * search — see the audit report); this file proposes the port and the
 * allowlist a real implementation would need, per the task's explicit
 * "propose a minimal provider interface... with explicit source-policy
 * enforcement" and "do not implement a general-purpose URL fetcher
 * without SSRF protection" instructions. No `fetch`/`http`/`https` import
 * appears anywhere in this file.
 *
 * The domain allowlist mirrors the pattern already proven in
 * src/engine/knowledge/crawler/legalinfo-url.ts (`isLegalInfoHostname`)
 * and shuukh-url.ts (`isShuukhHostname`) — exact-or-subdomain hostname
 * matching against a fixed, small allowlist, never a substring/regex
 * match on the full URL (which a hostile URL like
 * `https://legalinfo.mn.evil.example/` would defeat). A real fetcher
 * built on top of this MUST additionally resolve DNS and reject
 * private/loopback/link-local IPs before connecting (SSRF protection
 * that hostname matching alone cannot provide) — that check has no
 * meaning for a pure classifier and is intentionally out of scope here;
 * it belongs in the eventual HTTP implementation, not this module.
 */

export const WebSourceClass = {
  /** legalinfo.mn — the official statute/legal-text publisher. */
  OFFICIAL_LEGAL_SOURCE: "OFFICIAL_LEGAL_SOURCE",
  /** shuukh.mn — the official court-decision publisher. */
  OFFICIAL_COURT_SOURCE: "OFFICIAL_COURT_SOURCE",
  /** parliament.mn and other confirmed official .gov.mn-class domains. */
  OFFICIAL_GOVERNMENT_SOURCE: "OFFICIAL_GOVERNMENT_SOURCE",
  /** A real, working domain, but not on the official allowlist — e.g. a
   * law firm blog or news article discussing a statute. Never treated as
   * authoritative; a caller may still surface it as SECONDARY_WEB
   * evidence per legal-evidence-source.ts, but never as verified law. */
  SECONDARY_SOURCE: "SECONDARY_SOURCE",
  /** Anything not recognized. The default for every hostname not
   * explicitly listed below — this type errs toward "untrusted", never
   * toward "official". */
  UNKNOWN_SOURCE: "UNKNOWN_SOURCE",
} as const;

export type WebSourceClass = (typeof WebSourceClass)[keyof typeof WebSourceClass];

type OfficialDomainEntry = {
  host: string;
  webSourceClass: typeof WebSourceClass.OFFICIAL_LEGAL_SOURCE | typeof WebSourceClass.OFFICIAL_COURT_SOURCE | typeof WebSourceClass.OFFICIAL_GOVERNMENT_SOURCE;
  displayName: string;
};

/**
 * The complete, hand-reviewed list of domains this system may ever treat
 * as OFFICIAL_*. Adding a domain here is a deliberate, reviewed decision
 * — never derived from user input, LLM output, or a crawl result. The
 * three domains below are exactly the ones the audit task named as
 * candidates (legalinfo.mn, shuukh.mn, parliament.mn); no other
 * "official government domain" is pre-approved — see this module's own
 * top comment on why a real fetcher needs more than hostname matching.
 */
const OFFICIAL_DOMAIN_ALLOWLIST: readonly OfficialDomainEntry[] = [
  { host: "legalinfo.mn", webSourceClass: WebSourceClass.OFFICIAL_LEGAL_SOURCE, displayName: "LegalInfo.mn" },
  { host: "shuukh.mn", webSourceClass: WebSourceClass.OFFICIAL_COURT_SOURCE, displayName: "Шүүхийн шийдвэрийн сан" },
  { host: "parliament.mn", webSourceClass: WebSourceClass.OFFICIAL_GOVERNMENT_SOURCE, displayName: "Монгол Улсын Их Хурал" },
];

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function matchesAllowlistHost(hostname: string, allowlistHost: string): boolean {
  return hostname === allowlistHost || hostname.endsWith(`.${allowlistHost}`);
}

/**
 * Classifies a hostname (not a full URL — callers must have already
 * parsed and validated the URL, e.g. via `new URL(...)`, so this
 * function never itself needs to handle malformed input) against the
 * fixed official allowlist. Exact-or-subdomain match only, never a
 * substring/contains check on the raw string, so
 * "notlegalinfo.mn.attacker.example" or "legalinfo.mn.attacker.example"
 * both correctly classify as UNKNOWN_SOURCE, not OFFICIAL_LEGAL_SOURCE.
 */
export function classifyWebSourceHostname(hostname: string): WebSourceClass {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return WebSourceClass.UNKNOWN_SOURCE;
  for (const entry of OFFICIAL_DOMAIN_ALLOWLIST) {
    if (matchesAllowlistHost(normalized, entry.host)) {
      return entry.webSourceClass;
    }
  }
  return WebSourceClass.UNKNOWN_SOURCE;
}

/** Human-readable authority name for an official hostname, or null for a
 * non-official one. Used to fill `authority` on OfficialWebProvenance
 * without re-deriving it at every call site. */
export function officialAuthorityNameForHostname(hostname: string): string | null {
  const normalized = normalizeHostname(hostname);
  const entry = OFFICIAL_DOMAIN_ALLOWLIST.find((e) => matchesAllowlistHost(normalized, e.host));
  return entry?.displayName ?? null;
}

export function isOfficialWebSourceClass(webSourceClass: WebSourceClass): boolean {
  return (
    webSourceClass === WebSourceClass.OFFICIAL_LEGAL_SOURCE ||
    webSourceClass === WebSourceClass.OFFICIAL_COURT_SOURCE ||
    webSourceClass === WebSourceClass.OFFICIAL_GOVERNMENT_SOURCE
  );
}

export type LegalWebResearchResultItem = {
  url: string;
  webSourceClass: WebSourceClass;
  title: string;
  excerpt: string;
  retrievedAt: string;
};

export type LegalWebResearchResult =
  | { kind: "found"; items: readonly LegalWebResearchResultItem[] }
  | { kind: "empty" }
  | { kind: "unavailable"; reason: "not_implemented" | "timeout" | "network" | "disallowed_domain" };

/**
 * Application port a real web-research implementation would satisfy.
 * Mirrors the shape/naming of {@link LegalCorpusRetriever}
 * (legal-corpus.ts) deliberately, so composing it into
 * FallbackLegalCorpusRetriever-style "local, then this, only if
 * insufficient" logic is a small, familiar change when/if this is
 * implemented for real — not a new pattern to learn.
 *
 * No implementation of this interface exists in this codebase yet. The
 * only instance below ({@link UnimplementedLegalWebResearchProvider}) is
 * an explicit, always-"unavailable" stub — the same "not configured /
 * not implemented, degrade honestly, never throw, never fabricate a
 * result" pattern already used by UnavailableLegalCorpusRetriever in
 * fallback-legal-corpus-retriever.ts.
 */
export interface LegalWebResearchProvider {
  /** True only when a real, network-capable implementation is wired in.
   * The audit's default (and only shipped) implementation always returns
   * false, matching "production activation intentionally remains OFF"
   * for the generated-vocabulary work this audit follows. */
  readonly ready: boolean;
  search(query: string): Promise<LegalWebResearchResult>;
}

/**
 * The only implementation shipped by this audit. Always reports
 * "unavailable: not_implemented" — proves the port's shape compiles and
 * composes, without performing any network I/O. A real implementation
 * would need (at minimum, per Phase 8 of the audit): SSRF-safe DNS
 * resolution before connecting, HTML sanitization equivalent to
 * untrusted-document.ts's prompt-injection defenses, and reuse of
 * classifyWebSourceHostname() to refuse anything not on the allowlist
 * before ever issuing a request.
 */
export class UnimplementedLegalWebResearchProvider implements LegalWebResearchProvider {
  readonly ready = false;

  async search(_query: string): Promise<LegalWebResearchResult> {
    return { kind: "unavailable", reason: "not_implemented" };
  }
}
