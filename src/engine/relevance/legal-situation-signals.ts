import { normalizeMessage } from "@/engine/gateway";
import {
  LegalIssueFamily,
  type LegalIssueFamily as IssueFamily,
} from "./legal-relevance.types";

export type SituationHit = {
  id: string;
  family: IssueFamily;
};

type SignalRule = {
  id: string;
  family: IssueFamily;
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
    allOf: [
      ["айлд", "байранд", "гэрээс", "орон сууц", "хашаа", "хүн байхгүй"],
      ["ороод", "орж", "орсон", "хагалж"],
      ["аваад", "авсан", "авчихаад", "хулгайл", "зурагт"],
    ],
  },
  {
    id: "theft-or-robbery",
    family: LegalIssueFamily.CRIMINAL,
    any: [
      "хулгайлсан",
      "хулгай хийсэн",
      "дээрэмдсэн",
      "дээрэмд",
      "халаасны хулгай",
      "зөвшөөрөлгүй орж",
      "хагалж орсон",
    ],
  },
  {
    id: "assault-or-threat",
    family: LegalIssueFamily.CRIMINAL,
    any: ["зодсон", "зодож", "заналхийлсэн", "айлган", "хүчиндсэн", "гэмтээсэн"],
  },
  {
    id: "employment-dismissal",
    family: LegalIssueFamily.EMPLOYMENT,
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
    ],
  },
  {
    id: "boss-fired-me",
    family: LegalIssueFamily.EMPLOYMENT,
    allOf: [
      ["дарга", "ажил олгогч", "менежер"],
      ["гаргасан", "гаргачих", "халсан", "хөөсөн", "чөлөөлсөн"],
    ],
  },
  {
    id: "unpaid-debt",
    family: LegalIssueFamily.CIVIL,
    allOf: [
      ["мөнгө", "зээл", "өр", "төлбөр"],
      ["өгөхгүй", "төлөхгүй", "буцааж", "буцааж өгөхгүй"],
    ],
  },
  {
    id: "loan-not-returned",
    family: LegalIssueFamily.CIVIL,
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
    allOf: [
      ["нөхөр", "эхнэр", "хүүхдээ"],
      ["аваад яв", "авчихаад", "явчихсан", "авчихсан", "орхисон"],
    ],
  },
  {
    id: "family-separation",
    family: LegalIssueFamily.FAMILY,
    any: [
      "гэрлэлт цуцлах",
      "салалт",
      "хүүхдийн тэтгэлэг",
      "хүүхдийн асрамж",
      "гэр бүлээ орхисон",
    ],
  },
  {
    id: "traffic-incident",
    family: LegalIssueFamily.TRAFFIC,
    any: [
      "зам тээврийн осол",
      "замын хөдөлгөөний осол",
      "замын осол",
      "осолд орсон",
      "машин мөргөсөн",
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
      "түрээс төлөөд",
      "газартай маргаан",
      "орон сууцны маргаан",
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
];

const NON_LEGAL_TOPICS: readonly { id: string; phrases: readonly string[] }[] = [
  {
    id: "movies",
    phrases: [
      "кино үзэх",
      "ямар кино",
      "кинотеатр",
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
  "татвар",
  "лиценз",
  "зөвшөөрөл",
  "осол",
  "гэрээ",
] as const;

export function matchSituationSignals(message: string): SituationHit[] {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return [];
  }

  const hits: SituationHit[] = [];
  for (const rule of SITUATION_RULES) {
    if (ruleMatches(normalized, rule)) {
      hits.push({ id: rule.id, family: rule.family });
    }
  }
  return hits;
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
  return Boolean(needle) && haystack.includes(needle);
}
