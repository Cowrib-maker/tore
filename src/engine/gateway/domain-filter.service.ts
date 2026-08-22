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
    return (
      haystack.includes(needle) ||
      containsInflectedCyrillicPhrase(haystack, needle)
    );
  }

  const tokens = tokenizeCyrillic(haystack);
  return tokens.some(
    (token) => token === needle || token.startsWith(needle),
  );
}

function tokenizeCyrillic(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Multi-word Mongolian legal phrases inflect on the last word
 * (`гэмт хэрэг` → `гэмт хэргийн`). First words stay exact; the last
 * token may take a case ending or drop the unstable stem vowel.
 */
function containsInflectedCyrillicPhrase(
  haystack: string,
  needle: string,
): boolean {
  const needleTokens = needle.split(" ").filter(Boolean);
  const hayTokens = tokenizeCyrillic(haystack);
  if (needleTokens.length < 2 || hayTokens.length < needleTokens.length) {
    return false;
  }

  const lastNeedle = needleTokens[needleTokens.length - 1]!;
  const prefixLength = needleTokens.length - 1;

  for (let index = 0; index <= hayTokens.length - needleTokens.length; index += 1) {
    let prefixOk = true;
    for (let offset = 0; offset < prefixLength; offset += 1) {
      if (hayTokens[index + offset] !== needleTokens[offset]) {
        prefixOk = false;
        break;
      }
    }
    if (!prefixOk) {
      continue;
    }
    const lastHay = hayTokens[index + prefixLength]!;
    if (tokenMatchesInflectedStem(lastHay, lastNeedle)) {
      return true;
    }
  }
  return false;
}

function tokenMatchesInflectedStem(token: string, stem: string): boolean {
  if (token === stem || token.startsWith(stem)) {
    return true;
  }
  const stripped = stripMongolianCaseSuffix(token);
  if (stripped === stem || stripped === dropUnstableStemVowel(stem)) {
    return true;
  }
  return false;
}

/** Longest-first case endings. Single-letter cases are covered by startsWith. */
const MONGOLIAN_CASE_SUFFIXES = [
  "ийн",
  "ыйн",
  "ийг",
  "ыг",
  "ээс",
  "аас",
  "оос",
  "өөс",
  "ээр",
  "аар",
  "оор",
  "өөр",
  "руу",
  "рүү",
  "тай",
  "тэй",
  "той",
  "төй",
] as const;

function stripMongolianCaseSuffix(token: string): string {
  for (const suffix of MONGOLIAN_CASE_SUFFIXES) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/**
 * Mongolian CVCVC stems often drop the last inner vowel when inflected
 * (`хэрэг` → `хэрг` + `ийн`).
 */
function dropUnstableStemVowel(stem: string): string {
  const match = stem.match(
    /^(.*)[аэиоөуүеёы]([бвгджзклмнпрстфхцчшщ])$/u,
  );
  if (!match?.[1] || !match[2] || match[1].length < 2) {
    return stem;
  }
  return `${match[1]}${match[2]}`;
}

function isAsciiPhrase(value: string): boolean {
  return /^[a-z0-9 ]+$/i.test(value);
}
