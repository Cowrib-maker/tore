import { normalizeMessage } from "@/engine/gateway";
import {
  LegalIssueFamily,
  type LegalIssueFamily as IssueFamily,
} from "./legal-relevance.types";

export type FactDimension = "procedure" | "harm" | "status";

export type SituationHit = {
  id: string;
  family: IssueFamily;
  dimension?: FactDimension;
};

type SignalRule = {
  id: string;
  family: IssueFamily;
  dimension?: FactDimension;
  any?: readonly string[];
  allOf?: readonly (readonly string[])[];
};

/**
 * Everyday-language legal-problem cues. Not a closed list of TORE's
 * legal domains — add families here without waiting on IntentType.
 */
const SITUATION_RULES: readonly SignalRule[] = [
  {
    id: "unoccupied-entry-taking",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "harm",
    allOf: [
      ["айлд", "байранд", "гэрээс", "орон сууц", "хашаа", "хүн байхгүй"],
      ["ороод", "орж", "орсон", "хагалж"],
      ["аваад", "авсан", "авчихаад", "хулгайл", "зурагт"],
    ],
  },
  {
    id: "theft-or-robbery",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "harm",
    any: [
      "хулгайлсан",
      "хулгайлчих",
      "хулгай хийсэн",
      "дээрэмдсэн",
      "дээрэмд",
      "халаасны хулгай",
      "зөвшөөрөлгүй орж",
      "хагалж орсон",
      "хүний юм хулгай",
      "хүний юм ав",
      "хүний эд зүйл ав",
      "юм аваад яв",
    ],
  },
  {
    id: "assault-or-threat",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "harm",
    any: [
      "зодсон",
      "зодчих",
      "зодож",
      "зодолдсон",
      "заналхийлсэн",
      "айлган",
      "хүчиндсэн",
      "гэмтээсэн",
      "гэмтээчих",
      "сүрдүүлсэн",
      "дарамталсан",
    ],
  },
  {
    id: "employment-dismissal",
    family: LegalIssueFamily.EMPLOYMENT,
    dimension: "status",
    any: [
      "ажлаас гарга",
      "ажлаас хал",
      "ажилаас хал",
      "халагдсан",
      "халагдах",
      "халчихлаа",
      "ажлаасаа гаргасан",
      "гаргачихлаа",
      "цалин өгөхгүй",
      "цалингаа өгөхгүй",
      "цалингаа авч чадахгүй",
      "цалингаа аваагүй",
      "цалин аваагүй",
    ],
  },
  {
    id: "boss-fired-me",
    family: LegalIssueFamily.EMPLOYMENT,
    dimension: "status",
    allOf: [
      ["дарга", "ажил олгогч", "менежер"],
      ["гаргасан", "гаргачих", "халсан", "хөөсөн", "чөлөөлсөн"],
    ],
  },
  {
    id: "unpaid-debt",
    family: LegalIssueFamily.CIVIL,
    dimension: "status",
    allOf: [
      ["мөнгө", "зээл", "өр", "төлбөр"],
      ["өгөхгүй", "төлөхгүй", "буцааж", "буцааж өгөхгүй"],
    ],
  },
  {
    id: "loan-not-returned",
    family: LegalIssueFamily.CIVIL,
    dimension: "status",
    any: [
      "зээлээд буцааж",
      "зээлээд өгөхгүй",
      "мөнгөө авч чадахгүй",
      "өрөө төлөхгүй",
    ],
  },
  {
    id: "child-taken",
    family: LegalIssueFamily.FAMILY,
    dimension: "status",
    allOf: [
      ["нөхөр", "эхнэр", "хүүхдээ"],
      ["аваад яв", "авчихаад", "явчихсан", "авчихсан", "орхисон"],
    ],
  },
  {
    id: "family-separation",
    family: LegalIssueFamily.FAMILY,
    dimension: "status",
    any: [
      "гэрлэлт цуцлах",
      "салалт",
      "салах гэж",
      "хүүхдийн тэтгэлэг",
      "тэтгэлэг өгөхгүй",
      "тэтгэлгээ авч чадахгүй",
      "хүүхдийн асрамж",
      "хүүхдээ уулзуулахгүй",
      "уулзуулахгүй байна",
      "гэр бүлээ орхисон",
      "гэр бүлийн асуудал",
      "хүүхдээ өөр дээрээ",
    ],
  },
  {
    id: "traffic-incident",
    family: LegalIssueFamily.TRAFFIC,
    dimension: "harm",
    any: [
      "зам тээврийн осол",
      "замын хөдөлгөөний осол",
      "замын осол",
      "осолд орсон",
      "осолд орчих",
      "осолд ор",
      "машин мөргөсөн",
      "машин мөргөчих",
      "машин мөргөлдсөн",
      "мөргөлдсөн",
      "жолооны эрх",
      "эрхээ хураалгасан",
    ],
  },
  {
    id: "tax-issue",
    family: LegalIssueFamily.TAX,
    any: [
      "татвар төлөхгүй",
      "татварын торгууль",
      "татварын асуудал",
      "нөат",
      "татварын байгууллага",
    ],
  },
  {
    id: "consumer-issue",
    family: LegalIssueFamily.CONSUMER,
    any: [
      "бараа буцаах",
      "баталгаа хүчингүй",
      "залилж бараа",
      "мөнгөө буцааж өгөхгүй",
    ],
  },
  {
    id: "property-housing",
    family: LegalIssueFamily.PROPERTY,
    any: [
      "байрнаас нүүлгэсэн",
      "байрнаас гаргах",
      "байраа өгөхгүй",
      "түрээс төлөөд",
      "түрээсийн асуудал",
      "газартай маргаан",
      "орон сууцны маргаан",
      "эд зүйлийг өгөхгүй",
    ],
  },
  {
    id: "inheritance",
    family: LegalIssueFamily.INHERITANCE,
    any: ["өв залгамж", "гэрээслэл", "нас барсны дараа өв"],
  },
  {
    id: "ip-issue",
    family: LegalIssueFamily.INTELLECTUAL_PROPERTY,
    any: ["зохиогчийн эрх", "барааны тэмдэг хуулбар", "патент зөрч"],
  },
  {
    id: "company-name-misuse",
    family: LegalIssueFamily.INTELLECTUAL_PROPERTY,
    allOf: [
      ["компанийн нэр", "компанийн нэрийг"],
      ["ашигла"],
    ],
  },
  {
    id: "licensing-regulatory",
    family: LegalIssueFamily.LICENSING,
    any: ["тусгай зөвшөөрөл", "лиценз цуцлагдсан", "зөвшөөрөл олгохгүй"],
  },
  {
    id: "administrative-action",
    family: LegalIssueFamily.ADMINISTRATIVE,
    any: ["төрийн байгууллага", "захиргааны акт", "торгууль тавьсан"],
  },
  {
    id: "contract-broken",
    family: LegalIssueFamily.CONTRACT,
    any: ["гэрээ зөрчсөн", "гэрээгээ цуцалсан", "тохиролцоогоо биелүүлэхгүй"],
  },
  {
    id: "contract-unclear",
    family: LegalIssueFamily.CONTRACT,
    allOf: [
      ["гэрээ"],
      ["заалт", "ойлгомжгүй"],
    ],
  },
  {
    id: "court-proceeding",
    family: LegalIssueFamily.ADMINISTRATIVE,
    dimension: "procedure",
    any: [
      "шүүх хурал",
      "шүүх хуралд",
      "шүүх хуралтай",
      "шүүхэд дууд",
      "шүүх дээр оч",
      "шүүх дээр",
      "шүүхэд оч",
    ],
  },
  {
    id: "police-process",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "procedure",
    any: [
      "цагдаа намайг дууд",
      "цагдаагаас",
      "цагдаад шалга",
      "цагдаа шалга",
      "цагдаа дуудсан",
    ],
  },
  {
    id: "prosecutor-process",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "procedure",
    any: ["прокурорт дууд", "прокуророос дууд", "прокурор дууд"],
  },
  {
    id: "investigation-status",
    family: LegalIssueFamily.CRIMINAL,
    dimension: "procedure",
    any: [
      "мэдүүлэг өг",
      "байцаалт өг",
      "байцаалт",
      "хэрэгт холбогд",
      "хэрэг үүсгэ",
      "баривчлагд",
      "саатуулагд",
    ],
  },
  {
    id: "unpaid-wages",
    family: LegalIssueFamily.EMPLOYMENT,
    dimension: "status",
    allOf: [
      ["цалин", "цалингаа"],
      ["аваагүй", "өгөхгүй", "авч чадахгүй"],
    ],
  },
  {
    id: "workplace-trouble",
    family: LegalIssueFamily.EMPLOYMENT,
    dimension: "status",
    allOf: [
      ["дарга", "ажил олгогч", "ажил дээр"],
      ["асуудал"],
    ],
  },
  {
    id: "employer-unpaid",
    family: LegalIssueFamily.EMPLOYMENT,
    dimension: "status",
    allOf: [
      ["ажил олгогч", "дарга"],
      ["мөнгөө өгөхгүй", "өгөхгүй байна"],
    ],
  },
  {
    id: "property-damage",
    family: LegalIssueFamily.PROPERTY,
    dimension: "harm",
    any: [
      "юмыг эвд",
      "эвдчихсэн",
      "эвдсэн",
      "машиныг мөргө",
    ],
  },
  {
    id: "contract-not-performed",
    family: LegalIssueFamily.CONTRACT,
    dimension: "status",
    allOf: [
      ["гэрээ"],
      ["хийхгүй", "биелүүлэхгүй", "тохирсон"],
    ],
  },
];

const NON_LEGAL_TOPICS: readonly { id: string; phrases: readonly string[] }[] = [
  {
    id: "movies",
    phrases: [
      "кино үзэх",
      "кино үзлээ",
      "кино үзсэн",
      "ямар кино",
      "кинотеатр",
      "тухай кино",
      "кино байна",
      "нетфликс",
      "netflix",
    ],
  },
  {
    id: "weather",
    phrases: ["цаг агаар", "weather", "бороо орох", "цас орох уу"],
  },
  {
    id: "recipes",
    phrases: ["хоолны жор", "жор өг", "recipe"],
  },
  {
    id: "sports",
    phrases: ["футбол", "спорт", "тоглолтын оноо", "football"],
  },
  {
    id: "translation",
    phrases: ["орчуулж өг", "англи хэл рүү", "translate this"],
  },
  {
    id: "definition",
    phrases: ["гэдэг үг", "ямар утгатай", "утгатай вэ"],
  },
  {
    id: "greetings",
    phrases: ["сайн уу", "hello", "hi there", "юу байна даа"],
  },
];

const FIRST_PERSON_MARKERS = [
  "намайг",
  "надад",
  "надаас",
  "надтай",
  "манай",
  "миний",
  "бидний",
  "би яах",
] as const;

const PROBLEM_CUES = [
  "хохир",
  "маргаан",
  "гомдол",
  "дарамт",
  "залил",
  "хуурсан",
  "зодсон",
  "заналхийл",
  "авчихсан",
  "өгөхгүй",
  "төлөхгүй",
  "гаргасан",
  "халсан",
  "орхисон",
  "нүүлгэсэн",
  "торгуулсан",
  "цагдаа",
  "шүүх",
  "прокурор",
  "татвар",
  "лиценз",
  "зөвшөөрөл",
  "осол",
  "гэрээ",
  "асуудал",
  "тэтгэлэг",
  "аваагүй",
] as const;

export function matchSituationSignals(message: string): SituationHit[] {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return [];
  }

  const hits: SituationHit[] = [];
  for (const rule of SITUATION_RULES) {
    if (ruleMatches(normalized, rule)) {
      hits.push({
        id: rule.id,
        family: rule.family,
        dimension: rule.dimension,
      });
    }
  }

  if (isDetachedLegalMention(normalized) && !hasLivedInvolvement(normalized)) {
    return [];
  }

  return hits;
}

/**
 * Whole-message fact context: lived events vs a detached mention
 * (movie, definition) of a legal-looking word.
 */
export function analyzeLegalFactContext(message: string): {
  situations: SituationHit[];
  dimensions: FactDimension[];
  detachedMention: boolean;
  livedInvolvement: boolean;
} {
  const normalized = normalizeMessage(message);
  const situations = matchSituationSignals(message);
  const dimensions = [
    ...new Set(
      situations
        .map((hit) => hit.dimension)
        .filter((value): value is FactDimension => Boolean(value)),
    ),
  ];
  return {
    situations,
    dimensions,
    detachedMention: isDetachedLegalMention(normalized),
    livedInvolvement: hasLivedInvolvement(normalized),
  };
}

export function isDetachedLegalMention(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return false;
  }
  return (
    containsNormalized(normalized, "тухай кино") ||
    containsNormalized(normalized, "кино үз") ||
    containsNormalized(normalized, "кино байна") ||
    containsNormalized(normalized, "гэдэг үг") ||
    containsNormalized(normalized, "ямар утгатай")
  );
}

function hasLivedInvolvement(normalized: string): boolean {
  return [
    "орох гэж",
    "хуралтай",
    "хуралд",
    "дуудсан",
    "дуудагдсан",
    "шалгагд",
    "шалгасан",
    "хулгайл",
    "аваад яв",
    "зод",
    "гэмтээ",
    "мөргө",
    "осолд",
    "халчих",
    "ажлаас хал",
    "өгөхгүй",
    "аваагүй",
    "баривчла",
    "саатуула",
    "мэдүүлэг",
    "байцаалт",
    "холбогд",
    "үүсгэсэн",
  ].some((cue) => containsNormalized(normalized, cue));
}

export function matchNonLegalTopic(message: string): string | null {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return null;
  }

  for (const topic of NON_LEGAL_TOPICS) {
    if (topic.phrases.some((phrase) => containsNormalized(normalized, phrase))) {
      return topic.id;
    }
  }

  if (
    containsNormalized(normalized, "хэдэн хүүхэдтэй") &&
    !containsNormalized(normalized, "аваад яв") &&
    !containsNormalized(normalized, "нөхөр") &&
    !containsNormalized(normalized, "эхнэр")
  ) {
    return "trivia";
  }

  return null;
}

export function hasFirstPersonProblemNarrative(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length < 12) {
    return false;
  }
  const firstPerson = FIRST_PERSON_MARKERS.some((marker) =>
    containsNormalized(normalized, marker),
  );
  const problem = PROBLEM_CUES.some((cue) =>
    containsNormalized(normalized, cue),
  );
  return firstPerson && problem;
}

function ruleMatches(normalized: string, rule: SignalRule): boolean {
  if (rule.any?.some((phrase) => containsNormalized(normalized, phrase))) {
    return true;
  }
  if (!rule.allOf || rule.allOf.length === 0) {
    return false;
  }
  return rule.allOf.every((group) =>
    group.some((phrase) => containsNormalized(normalized, phrase)),
  );
}

function containsNormalized(haystack: string, phrase: string): boolean {
  const needle = normalizeMessage(phrase);
  if (!needle) {
    return false;
  }
  if (haystack.includes(needle)) {
    return true;
  }
  const relaxedHay = stripColloquialAspect(haystack);
  const relaxedNeedle = stripColloquialAspect(needle);
  return Boolean(relaxedNeedle) && relaxedHay.includes(relaxedNeedle);
}

/**
 * Colloquial perfective -чих- (`хулгайлчихсан` → `хулгайлсан`,
 * `осолд орчихсон` → `осолд орсон`).
 */
export function stripColloquialAspect(value: string): string {
  return value.replace(/чих/g, "");
}
