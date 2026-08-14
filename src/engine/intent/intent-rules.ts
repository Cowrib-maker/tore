import { IntentType, type IntentRule } from "./intent.types";

type TermSpec = {
  id: string;
  intent: IntentType;
  weight: number;
  terms: readonly string[];
};

/**
 * Default intent catalog (Mongolian + English).
 *
 * Add terms here or pass extra {@link IntentRule}s into
 * {@link RuleBasedIntentClassifier} — do not change {@link IntentService}.
 */
const INTENT_TERM_SPECS: readonly TermSpec[] = [
  {
    id: "legal-information",
    intent: IntentType.LEGAL_INFORMATION,
    weight: 1,
    terms: [
      "хуулийн мэдээлэл",
      "ямар хууль",
      "хууль юу гэж",
      "эрх зүйн мэдээлэл",
      "legal information",
      "what does the law say",
      "explain the law",
      "legal question",
    ],
  },
  {
    id: "legal-research",
    intent: IntentType.LEGAL_RESEARCH,
    weight: 2.2,
    terms: [
      "эрх зүйн судалгаа",
      "хууль судал",
      "прецедент",
      "legalinfo",
      "legal research",
      "case law",
      "find the statute",
      "search the law",
    ],
  },
  {
    id: "case-analysis",
    intent: IntentType.CASE_ANALYSIS,
    weight: 2.4,
    terms: [
      "хэргийн шинжилгээ",
      "хэргийг шинжлэх",
      "хэргийн нөхцөл",
      "маргааны шинжилгээ",
      "analyze this case",
      "case analysis",
      "issue spotting",
      "facts of the case",
    ],
  },
  {
    id: "document-review",
    intent: IntentType.DOCUMENT_REVIEW,
    weight: 2.2,
    terms: [
      "баримт шалгах",
      "баримт унших",
      "баримтын шинжилгээ",
      "review this document",
      "document review",
      "review the papers",
    ],
  },
  {
    id: "contract-review",
    intent: IntentType.CONTRACT_REVIEW,
    weight: 2.6,
    terms: [
      "гэрээ шалгах",
      "гэрээний заалт",
      "гэрээ хянах",
      "гэрээний эрсдэл",
      "review this contract",
      "contract review",
      "review the agreement",
    ],
  },
  {
    id: "document-drafting",
    intent: IntentType.DOCUMENT_DRAFTING,
    weight: 2.5,
    terms: [
      "баримт боловсруулах",
      "баримт бичих",
      "загвар бэлтгэх",
      "бичиж өгнө үү",
      "draft a document",
      "drafting",
      "prepare a document",
      "write a legal document",
    ],
  },
  {
    id: "company-formation",
    intent: IntentType.COMPANY_FORMATION,
    weight: 2.8,
    terms: [
      "компани байгуулах",
      "ххк байгуулах",
      "улсын бүртгэл",
      "хуулийн этгээд байгуулах",
      "company formation",
      "incorporate",
      "incorporation",
      "register a company",
      "form an llc",
    ],
  },
  {
    id: "employment-dispute",
    intent: IntentType.EMPLOYMENT_DISPUTE,
    weight: 2.8,
    terms: [
      "хөдөлмөрийн маргаан",
      "хөдөлмөрийн гэрээ",
      "ажилаас халах",
      "цалингийн маргаан",
      "хөдөлмөр эрхлэлт",
      "employment dispute",
      "wrongful termination",
      "labor dispute",
      "unpaid wages",
    ],
  },
  {
    id: "family-law",
    intent: IntentType.FAMILY_LAW,
    weight: 2.8,
    terms: [
      "гэрлэлт цуцлах",
      "гэр бүлийн хууль",
      "хүүхдийн тэтгэлэг",
      "асрамж",
      "гэрлэлт",
      "family law",
      "divorce",
      "child custody",
      "alimony",
    ],
  },
  {
    id: "criminal-law",
    intent: IntentType.CRIMINAL_LAW,
    weight: 2.8,
    terms: [
      "эрүүгийн",
      "гэмт хэрэг",
      "ял шийтгэл",
      "мөрдөн байцаалт",
      "эрүүгийн хууль",
      "criminal law",
      "criminal charge",
      "indictment",
      "felony",
    ],
  },
  {
    id: "civil-law",
    intent: IntentType.CIVIL_LAW,
    weight: 2.4,
    terms: [
      "иргэний хууль",
      "иргэний хэрэг",
      "хор хохирол",
      "нэхэмжлэл гаргах",
      "civil law",
      "civil claim",
      "damages",
      "tort",
    ],
  },
  {
    id: "administrative-law",
    intent: IntentType.ADMINISTRATIVE_LAW,
    weight: 2.8,
    terms: [
      "захиргааны хууль",
      "захиргааны хэрэг",
      "захиргааны акт",
      "төрийн байгууллага",
      "тусгай зөвшөөрөл",
      "administrative law",
      "administrative act",
      "government permit",
      "license appeal",
    ],
  },
];

/**
 * Specificity used to break score ties. Practice-area intents outrank
 * generic information / review so mixed matches stay useful.
 */
export const INTENT_SPECIFICITY: Record<IntentType, number> = {
  UNKNOWN: 0,
  LEGAL_INFORMATION: 1,
  LEGAL_RESEARCH: 2,
  DOCUMENT_REVIEW: 3,
  CASE_ANALYSIS: 3,
  DOCUMENT_DRAFTING: 4,
  CIVIL_LAW: 4,
  CONTRACT_REVIEW: 5,
  COMPANY_FORMATION: 6,
  EMPLOYMENT_DISPUTE: 6,
  FAMILY_LAW: 6,
  CRIMINAL_LAW: 6,
  ADMINISTRATIVE_LAW: 6,
};

/** Default rule set consumed by {@link RuleBasedIntentClassifier}. */
export const DEFAULT_INTENT_RULES: readonly IntentRule[] =
  INTENT_TERM_SPECS.flatMap((spec) =>
    spec.terms.map((term) => ({
      id: `${spec.id}:${term}`,
      intent: spec.intent,
      weight: spec.weight,
      test: (normalizedMessage: string) =>
        containsPhrase(normalizedMessage, term),
    })),
  );

/**
 * Builds additional phrase rules for a single intent.
 * Use this to extend the catalog without editing {@link DEFAULT_INTENT_RULES}.
 */
export function createIntentTermRules(
  intent: IntentType,
  terms: readonly string[],
  weight = 2,
): IntentRule[] {
  return terms.map((term) => ({
    id: `custom:${intent}:${term}`,
    intent,
    weight,
    test: (normalizedMessage: string) => containsPhrase(normalizedMessage, term),
  }));
}

/** Lowercase, Unicode-normalize, and collapse whitespace. */
export function normalizeIntentMessage(message: string): string {
  return message.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = normalizeIntentMessage(phrase);
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
