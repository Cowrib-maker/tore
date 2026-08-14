import {
  DomainLabel,
  type DomainFilterResult,
  type DomainFilterRule,
  type IDomainFilter,
} from "./types";

/**
 * Default legal phrases (Mongolian + English).
 * Extend via {@link RuleBasedDomainFilter.withRules} or the constructor —
 * do not edit call sites when adding terms.
 */
export const DEFAULT_LEGAL_TERMS = [
  "хууль",
  "хуулийн",
  "хуульч",
  "өмгөөлөгч",
  "шүүх",
  "шүүгч",
  "шүүхийн",
  "гэрээ",
  "нэхэмжлэл",
  "нотариат",
  "нотариатч",
  "эрүүгийн",
  "иргэний хууль",
  "захиргааны",
  "хөдөлмөрийн гэрээ",
  "үндсэн хууль",
  "эрх зүй",
  "эрх зүйн",
  "гэмт хэрэг",
  "зөрчил шалгах",
  "өв залгамжлал",
  "гэрлэлт цуцлах",
  "оюуны өмч",
  "татварын хууль",
  "лицензийн эрх",
  "legalinfo",
  "attorney",
  "lawyer",
  "lawsuit",
  "litigation",
  "statute",
  "regulation",
  "compliance",
  "liability",
  "plaintiff",
  "defendant",
  "contract law",
  "court",
  "legal advice",
  "legal question",
] as const;

/**
 * Rule-based {@link IDomainFilter}.
 *
 * Designed so a classifier model can replace this class without changing
 * {@link GatewayService}: implement {@link IDomainFilter} and inject it.
 */
export class RuleBasedDomainFilter implements IDomainFilter {
  constructor(
    private readonly rules: readonly DomainFilterRule[] = createTermRules(
      DEFAULT_LEGAL_TERMS,
    ),
  ) {}

  /**
   * Returns a new filter that keeps existing rules and appends `rules`.
   * Prefer this over mutating shared instances.
   */
  withRules(rules: readonly DomainFilterRule[]): RuleBasedDomainFilter {
    return new RuleBasedDomainFilter([...this.rules, ...rules]);
  }

  classify(message: string): DomainFilterResult {
    const normalized = normalizeMessage(message);
    if (!normalized) {
      return {
        domain: DomainLabel.NON_LEGAL,
        method: "rule",
        matchedRuleIds: [],
        confidence: 0,
      };
    }

    const matchedRuleIds = this.rules
      .filter((rule) => rule.test(normalized))
      .map((rule) => rule.id);

    if (matchedRuleIds.length === 0) {
      return {
        domain: DomainLabel.NON_LEGAL,
        method: "rule",
        matchedRuleIds: [],
        confidence: 0.2,
      };
    }

    const legalHit = this.rules.some(
      (rule) =>
        matchedRuleIds.includes(rule.id) &&
        (rule.domain ?? DomainLabel.LEGAL) === DomainLabel.LEGAL,
    );

    return {
      domain: legalHit ? DomainLabel.LEGAL : DomainLabel.NON_LEGAL,
      method: "rule",
      matchedRuleIds,
      confidence: Math.min(1, 0.55 + matchedRuleIds.length * 0.15),
    };
  }
}

/** Builds phrase rules from a term list. Exported for tests and custom catalogs. */
export function createTermRules(
  terms: readonly string[],
  domain: DomainLabel = DomainLabel.LEGAL,
): DomainFilterRule[] {
  return terms.map((term) => ({
    id: `term:${term}`,
    domain,
    test: (normalizedMessage) => containsPhrase(normalizedMessage, term),
  }));
}

/** Lowercase, Unicode-normalize, and collapse whitespace. */
export function normalizeMessage(message: string): string {
  return message.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = normalizeMessage(phrase);
  if (!needle) {
    return false;
  }

  if (isAsciiPhrase(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(
      haystack,
    );
  }

  if (needle.includes(" ")) {
    return haystack.includes(needle);
  }

  const tokens = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.some(
    (token) => token === needle || token.startsWith(needle),
  );
}

function isAsciiPhrase(value: string): boolean {
  return /^[a-z0-9 ]+$/i.test(value);
}
