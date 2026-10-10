import type { Gender, StemClass } from "./phonology";

/**
 * Inflectional suffix inventory (grammar data, not vocabulary).
 *
 * A Variant is a back/front PAIR so a wrong-gender suffix can be repaired to
 * its exact counterpart. `round` variants (оо/өө, ой/өй …) are only licensed
 * when the stem itself contains о / ө. Only INFLECTIONAL suffixes are listed:
 * a derivational suffix here could make an unrelated valid word look like a
 * misspelled inflection, which is a false-positive risk.
 */

export type Variant = {
  M: string | null;
  F: string | null;
  /** Licensed only when the stem contains о (for M) / ө (for F). */
  round?: boolean;
  /** Extra condition under which a MASCULINE stem may take the «F» string. */
  mTakesF?: "iForm";
  /** Licensed only for stems ending in this letter. */
  endsWith?: string;
  /** Licensed only for stems NOT ending in this letter. */
  notEndsWith?: string;
  /** Licensed only for a lemma carrying this lexicon flag (e.g. "cvb:ч"). */
  flag?: string;
  /** Extra stem condition, evaluated on the stem the suffix attaches to. */
  when?: StemCondition;
  /** Licensed only when the stem is NOT round (no о / ө): the plain sibling of a labial pair. */
  noRound?: boolean;
  /** Also licensed after a vowel-final stem of an «ажилла-» type verb (hortative я/е/ё). */
  vstemOk?: boolean;
  /**
   * Strict labial harmony: «round» means the stem's LAST non-neutral vowel is
   * о / ө / ё (оногдуул-аагүй but нотл-оогүй), not merely «contains о». Plain
   * variants of a strict pair are never licensed for a round stem, and vice
   * versa. Older groups stay lenient (олсан is accepted next to олсон).
   */
  strict?: boolean;
};

/**
 * Closed set of stem conditions (explicit, testable, no free-form predicates).
 *  - "r-v-l":       stem ends in р, в, or a single л (not лл)
 *  - "not-r-v-l":   the complement
 *  - "r":           stem ends in р
 *  - "not-r":       stem does not end in р
 *  - "t-c-sh":      stem ends in т, ц or ш (унт-ана, танилц-ана, унш-ина)
 *  - "prs-direct":  stem ends in р л м в г ч с з: «-на» attaches directly (ирнэ, хэлнэ, авна, засна)
 *  - "linked-tsg":  stem ends in д т н ц ч ш ж: «-цгаа» takes the linking vowel (бичицгээ, унтацгаа)
 *  - "linked-cvb":  stem ends in an obstruent (д т з с ч ш ц ж х к п ф щ) or in two consonants: the converb
 *                   «-ж» takes the linking vowel (мэдэж, бодож, унтаж, бичиж, хамтраж). After a single
 *                   sonorant (р л м в г н) the converb is BARE and lexical (харж, хэлж, олж / авч, өгч):
 *                   see CVB_BARE.
 *  - "not-v":       stem does not end in в (the conditional «-вал» is not written аввал / яввал)
 *  A stem outside every listed set is NOT accepted: the spelling there is not established (UNKNOWN).
 *  - "long-final":  stem ends in й or in two vowel letters (хий-, хаа-, нээ-, суу-): only these take the
 *                   г-linked converb/participle endings (хий-гээд). A short final vowel (ажилла-, дүгнэ-)
 *                   never does: ажиллаад, not ажиллагаад.
 */
export type StemCondition = "r-v-l" | "not-r-v-l" | "r" | "not-r" | "t-c-sh" | "prs-direct" | "linked-tsg" | "linked-cvb" | "not-v" | "long-final";

export function stemConditionHolds(cond: StemCondition, stem: string): boolean {
  const last = stem[stem.length - 1] ?? "";
  const prev = stem[stem.length - 2] ?? "";
  const rvl = last === "р" || last === "в" || (last === "л" && prev !== "л");
  switch (cond) {
    case "r-v-l":
      return rvl;
    case "not-r-v-l":
      return !rvl;
    case "r":
      return last === "р";
    case "not-r":
      return last !== "р";
    case "long-final":
      return last === "й" || (prev !== "" && "аэиоуөүяеёюы".includes(last) && "аэиоуөүяеёюы".includes(prev));
    case "t-c-sh":
      return last === "т" || last === "ц" || last === "ш";
    case "prs-direct":
      return "рлмвгчсз".includes(last);
    case "linked-tsg":
      return "дтнцчшж".includes(last);
    case "linked-cvb": {
      const cons = (c: string) => "бвгджзклмнпрстфхцчшщ".includes(c);
      return "дтзсчшцжхкпфщ".includes(last) || (prev !== "" && cons(last) && cons(prev));
    }
    case "not-v":
      return last !== "в";
  }
}

export type SuffixGroup = { tag: string; variants: readonly Variant[] };

const v = (M: string | null, F: string | null, extra: Partial<Variant> = {}): Variant => ({ M, F, ...extra });
/** Mark a verb group's variants as strict-labial (see Variant.strict). */
const strictly = (vs: readonly Variant[]): Variant[] => vs.map((x) => ({ ...x, strict: true }));
/** Strict labial pair: plain only for non-round stems, round only for round stems. */
const lab = (a: string, e: string, o: string, ö: string, extra: Partial<Variant> = {}): Variant[] =>
  strictly([v(a, e, { noRound: true, ...extra }), v(o, ö, { round: true, ...extra })]);

// ───────────────────────── Nouns ─────────────────────────

/** PLURAL, by class of the stem it attaches to. */
export const NOUN_PLURAL: Record<StemClass, readonly Variant[]> = {
  C: [v("ууд", "үүд"), v("ид", "ид")],
  Y: [v("нууд", "нүүд")],
  V: [v("нууд", "нүүд")],
  SOFT: [], // soft stems use SOFT_I_* (the «и»-stem) instead
};

/** CASE, by class of the stem it attaches to. */
export const NOUN_CASE: Record<StemClass, readonly SuffixGroup[]> = {
  C: [
    {
      tag: "GEN",
      variants: [
        v("ын", "ийн"),
        v("ны", "ний"),
        v("ийн", "ийн", { mTakesF: "iForm" }),
        v("ы", "ий", { endsWith: "н" }), // хүний, ажилтны (after н)
      ],
    },
    {
      tag: "DAT",
      variants: [
        v("д", "д", { notEndsWith: "х" }), // хариулахад, not хариулахд (24 of 24 х-final nouns in the oracle)
        v("т", "т", { notEndsWith: "х" }),
        v("ад", "эд"),
        v("од", "өд", { round: true }),
        v("ид", "ид"),
        v("анд", "энд"),
        v("онд", "өнд", { round: true }),
        v("инд", "инд"),
      ],
    },
    { tag: "ACC", variants: [v("ыг", "ийг"), v("ийг", "ийг", { mTakesF: "iForm" })] },
    {
      tag: "ABL",
      variants: [
        v("аас", "ээс"),
        v("оос", "өөс", { round: true }),
        v("наас", "нээс"),
        v("ноос", "нөөс", { round: true }),
      ],
    },
    { tag: "INS", variants: [v("аар", "ээр"), v("оор", "өөр", { round: true })] },
    { tag: "COM", variants: [v("тай", "тэй"), v("той", "төй", { round: true })] },
    { tag: "PRIV", variants: [v("гүй", "гүй")] },
  ],
  Y: [
    { tag: "GEN", variants: [v("н", "н"), v("ны", "ний")] },
    { tag: "DAT", variants: [v("д", "д")] },
    { tag: "ACC", variants: [v("г", "г")] },
    {
      tag: "ABL",
      variants: [
        v("гаас", "гээс"),
        v("гоос", "гөөс", { round: true }),
        v("наас", "нээс"),
        v("ноос", "нөөс", { round: true }),
      ],
    },
    { tag: "INS", variants: [v("гаар", "гээр"), v("гоор", "гөөр", { round: true })] },
    { tag: "COM", variants: [v("тай", "тэй"), v("той", "төй", { round: true })] },
    { tag: "PRIV", variants: [v("гүй", "гүй")] },
  ],
  V: [
    { tag: "GEN", variants: [v("ны", "ний")] },
    { tag: "DAT", variants: [v("нд", "нд"), v("д", "д")] },
    { tag: "ACC", variants: [v("г", "г")] },
    { tag: "ABL", variants: [v("наас", "нээс"), v("ноос", "нөөс", { round: true }), v("гаас", "гээс")] },
    { tag: "INS", variants: [v("гаар", "гээр"), v("гоор", "гөөр", { round: true }), v("аар", "ээр")] },
    { tag: "COM", variants: [v("тай", "тэй"), v("той", "төй", { round: true })] },
    { tag: "PRIV", variants: [v("гүй", "гүй")] },
  ],
  // ь-final stem, BARE (consonant-initial suffixes only): хуульд, хуультай
  SOFT: [
    { tag: "DAT", variants: [v("д", "д"), v("т", "т")] },
    { tag: "COM", variants: [v("тай", "тэй"), v("той", "төй", { round: true })] },
    { tag: "PRIV", variants: [v("гүй", "гүй")] },
  ],
};

/**
 * ь-stem attached to its «и»-form (хууль → хуули-): хуулийн, хуулиар,
 * хуулиас, хуулиуд. Genders are listed identically on both sides on purpose:
 * the soft-stem paradigm is NOT used to claim harmony errors.
 */
const both = (...forms: string[]): Variant[] => forms.map((s) => v(s, s));
export const SOFT_I_CASE: readonly SuffixGroup[] = [
  { tag: "GEN", variants: both("йн", "ны", "ний", "ийн") },
  { tag: "ACC", variants: both("йг", "г", "ийг") },
  { tag: "ABL", variants: both("ас", "эс", "ос", "өс") },
  { tag: "INS", variants: both("ар", "эр", "ор", "өр") },
];
export const SOFT_I_PLURAL: readonly Variant[] = both("уд", "үд");
/** Reflexive after a soft/и-final stem, shortened: хуулиа, химиэ, экологио. */
export const SOFT_I_REFLEXIVE: readonly Variant[] = both("а", "э", "о", "ө");

/** Reflexive possessive («own»): номоо, гэрээ, гэртээ, номдоо … */
export const REFLEXIVE_AFTER_CONSONANT: readonly Variant[] = [
  v("аа", "ээ"),
  v("оо", "өө", { round: true }),
];
export const REFLEXIVE_AFTER_VOWEL: readonly Variant[] = [
  v("гаа", "гээ"),
  v("гоо", "гөө", { round: true }),
];
/** After a genitive: номынхоо, гэрийнхээ. */
export const REFLEXIVE_AFTER_GENITIVE: readonly Variant[] = [
  v("хаа", "хээ"),
  v("хоо", "хөө", { round: true }),
];

// ───────────────────────── Verbs ─────────────────────────

/**
 * A verb suffix group. Strings are written as they appear AFTER the stem:
 *
 *  - «~» stands for the verb's own linking vowel (the vowel before «х» in the
 *    infinitive: зур-а-х → зурав, ир-э-х → ирэв, бич-и-х → бичив, төр-ө-х → төрөв).
 *    It is only meaningful after a consonant-final stem, so it appears in
 *    `afterC` only.
 *  - A suffix whose first LETTER is a consonant (including the separating signs
 *    ъ / ь) attaches to the consonant-initial stem allomorph (a hidden vowel
 *    may be present: хөхөр-вөл); a vowel-initial suffix attaches to the bare
 *    stem (хөхр-өв). The analyzer derives this from the first letter.
 *
 * Every group lists only forms that are attested in standard orthography. A
 * group is a VALIDATION rule: it can never make a form valid for a lemma whose
 * stem class does not license it.
 */
export type VerbGroup = {
  tag: string;
  /** After a consonant-final stem. */
  afterC: readonly Variant[];
  /** After a vowel/й-final stem. */
  afterV: readonly Variant[];
  /** Also accept a д↔т final-consonant slip as a CONSONANT_CONFUSION. */
  consonantConfusion?: boolean;
  /** May be followed by noun case suffixes (verbal noun). */
  nominal?: boolean;
};

export const VERB_GROUPS: readonly VerbGroup[] = [
  // ── converbs ──
  {
    // converb «-ж» with the verb's own linking vowel after obstruent / cluster stems: мэдэж, бодож,
    // унтаж, бичиж, хамтраж. After a single sonorant the converb is bare and lexical (CVB_BARE).
    tag: "CVB_J",
    afterC: [v("~ж", "~ж", { when: "linked-cvb" })],
    afterV: [v("ж", "ж")],
  },
  {
    // bare «-ж» / «-ч» after a consonant stem. Lexical (явж but авч, орж but гарч):
    // only for lemmas that carry the flag.
    tag: "CVB_BARE",
    afterC: [v("ж", "ж", { flag: "cvb:ж" }), v("ч", "ч", { flag: "cvb:ч" })],
    afterV: [],
  },

  {
    tag: "CVB_AAD",
    afterC: lab("аад", "ээд", "оод", "өөд"),
    afterV: lab("гаад", "гээд", "гоод", "гөөд", { when: "long-final" }),
    consonantConfusion: true,
  },

  {
    tag: "UNTIL_TAL",
    afterC: lab("тал", "тэл", "тол", "төл"),
    afterV: lab("тал", "тэл", "тол", "төл"),
    consonantConfusion: false,
  },

  {
    // as soon as: зурмагц, төрмөгц
    tag: "CVB_MAGC",
    afterC: strictly([v("магц", "мэгц", { noRound: true }), v("могц", "мөгц", { round: true })]),
    afterV: strictly([v("магц", "мэгц", { noRound: true }), v("могц", "мөгц", { round: true })]),
  },
  {
    // while: зурангаа, ирэнгээ, сонсонгоо (the linking vowel is the verb's own)
    tag: "CVB_NGAA",
    afterC: strictly([v("~нгаа", "~нгээ", { noRound: true }), v("~нгоо", "~нгөө", { round: true })]),
    afterV: strictly([v("нгаа", "нгээ", { noRound: true }), v("нгоо", "нгөө", { round: true })]),
  },
  {
    // without: зуралгүй, ирэлгүй, хийлгүй
    tag: "CVB_LGUI",
    afterC: [v("~лгүй", "~лгүй")],
    afterV: [v("лгүй", "лгүй")],
  },
  {
    // ever since: ирсээр, авсаар
    tag: "CVB_SAAR",
    afterC: strictly([v("саар", "сээр", { noRound: true }), v("соор", "сөөр", { round: true })]),
    afterV: strictly([v("саар", "сээр", { noRound: true }), v("соор", "сөөр", { round: true })]),
  },
  // ── participles ──
  {
    tag: "PTCP_PAST",
    afterC: lab("сан", "сэн", "сон", "сөн"),
    afterV: lab("сан", "сэн", "сон", "сөн"),
    nominal: true,
  },

  {
    // negative participle: зураагүй, ирээгүй, өгөөгүй, хийгээгүй
    tag: "PTCP_NEG",
    afterC: strictly([v("аагүй", "ээгүй", { noRound: true }), v("оогүй", "өөгүй", { round: true })]),
    afterV: lab("гаагүй", "гээгүй", "гоогүй", "гөөгүй", { when: "long-final" }),
  },
  {
    tag: "HAB_DAG",
    afterC: lab("даг", "дэг", "дог", "дөг"),
    afterV: lab("даг", "дэг", "дог", "дөг"),
  },

  // ── finite forms ──
  {
    tag: "PAST_LAA",
    afterC: lab("лаа", "лээ", "лоо", "лөө"),
    afterV: lab("лаа", "лээ", "лоо", "лөө"),
  },

  {
    // definite past «-в»: зурав, ирэв, бичив, сонсов, хийв
    tag: "PRF_V",
    afterC: [v("~в", "~в")],
    afterV: [v("в", "в")],
  },
  {
    // evidential past «-жээ» (ж + ээ); «-чээ» after р
    tag: "PAST_ZHEE",
    afterC: [v("жээ", "жээ", { when: "not-r" }), v("чээ", "чээ", { when: "r" })],
    afterV: [v("жээ", "жээ")],
  },
  {
    // present/future «-на»: directly after р л м в г ч с з (зурна, ирнэ, бичнэ, засна), with the
    // linking vowel after т / ц / ш (унтана, танилцана, уншина). Other stems: spelling not
    // established → UNKNOWN.
    tag: "PRS_NA",
    afterC: strictly([
      v("на", "нэ", { noRound: true, when: "prs-direct" }),
      v("но", "нө", { round: true, when: "prs-direct" }),
      v("~на", "~нэ", { noRound: true, when: "t-c-sh" }),
      v("~но", "~нө", { round: true, when: "t-c-sh" }),
    ]),
    afterV: lab("на", "нэ", "но", "нө"),
  },

  // ── mood ──
  {
    tag: "COND_VAL",
    afterC: lab("вал", "вэл", "вол", "вөл", { when: "not-v" }),
    afterV: lab("вал", "вэл", "вол", "вөл"),
  },

  {
    tag: "OPT_MAAR",
    afterC: lab("маар", "мээр", "моор", "мөөр"),
    afterV: lab("маар", "мээр", "моор", "мөөр"),
  },

  {
    // optative: зураасай, ирээсэй, сонсоосой
    tag: "OPT_AASAI",
    afterC: strictly([v("аасай", "ээсэй", { noRound: true }), v("оосой", "өөсэй", { round: true })]),
    afterV: lab("гаасай", "гээсэй", "гоосой", "гөөсэй", { when: "long-final" }),
  },
  {
    // hortative «let us»: зуръя, төрье, овоолъё; after a vowel: уяя, товойё
    tag: "HORT_YA",
    afterC: strictly([v("ъя", "ье", { noRound: true }), v("ъё", "ье", { round: true })]),
    afterV: strictly([
      v("я", "е", { noRound: true, vstemOk: true }),
      v("ё", "е", { round: true, vstemOk: true }),
    ]),
  },
  // ── imperatives ──
  {
    // polite imperative: бичээрэй, зураарай
    tag: "IMP_AARAI",
    afterC: strictly([v("аарай", "ээрэй", { noRound: true }), v("оорой", "өөрэй", { round: true })]),
    afterV: lab("гаарай", "гээрэй", "гоорой", "гөөрэй", { when: "long-final" }),
  },
  {
    // polite request: бичээч, ирээч, аваач, өгөөч
    tag: "IMP_AACH",
    afterC: strictly([v("аач", "ээч", { noRound: true }), v("ооч", "өөч", { round: true })]),
    afterV: lab("гаач", "гээч", "гооч", "гөөч", { when: "long-final" }),
  },
  {
    // perfective imperative: зурчих (invariant)
    tag: "IMP_CHIH",
    afterC: [v("чих", "чих")],
    afterV: [v("чих", "чих")],
  },
  {
    // plural imperative «-цгаа»: directly after р, в, single л (зурцгаа, авцгаа,
    // мэдээлцгээ), with the linking vowel after the other consonants (сонсоцгоо,
    // бичицгээ, унтацгаа). Evidence: UniMorph khk + attested «явцгаая», «унтацгаая».
    tag: "IMP_TSGAA",
    afterC: strictly([
      v("цгаа", "цгээ", { when: "r-v-l", noRound: true }),
      v("цгоо", "цгөө", { when: "r-v-l", round: true }),
      v("~цгаа", "~цгээ", { when: "linked-tsg", noRound: true }),
      v("~цгоо", "~цгөө", { when: "linked-tsg", round: true }),
    ]),
    afterV: strictly([v("цгаа", "цгээ", { noRound: true }), v("цгоо", "цгөө", { round: true })]),
  },
];

export type { Gender };
