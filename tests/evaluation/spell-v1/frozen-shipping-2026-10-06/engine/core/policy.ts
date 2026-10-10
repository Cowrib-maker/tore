import type { ReasonCode, Severity } from "./types";

/**
 * Confidence/precision policy. Every MISSPELLED reason has a fixed base
 * detection confidence, justified by how much independent evidence the rule
 * needs. A rule never fires on its own say-so: its correction must itself be
 * VALID (lexicon or morphology), which is what makes the confidence real.
 */
export const DEFAULT_MIN_DETECTION_CONFIDENCE = 0.7;
export const DEFAULT_MAX_SUGGESTIONS = 3;

export const REASON_BASE_CONFIDENCE: Partial<Record<ReasonCode, number>> = {
  TYPO_PAIR: 0.97, // curated, human-reviewed pair
  HARMONY_SUFFIX: 0.93, // known lemma + suffix of the wrong vowel gender
  SUFFIX_CONSONANT_CONFUSION: 0.88, // known lemma + д/т-confused suffix
  STEM_VOWEL_MISSING: 0.9, // lexicon-FLAGGED verb stem written without its vowel (ажиллсан → ажилласан)
  YI_FEMININE_STEM: 0.9, // feminine stem + ы-suffix (§10)
  DOUBLED_FINAL_LETTER: 0.9, // valid word + one repeated final consonant
  DIGIT_GLUED: 0.9, // valid word + stray digits
  MIXED_SCRIPT_LOOKALIKE: 0.9, // Latin look-alike letters inside a Cyrillic word
  DIGRAPH_II_FOR_IY: 0.88, // «ии» typed for «ий», correction valid
  HARMONY_VIOLATION_NEIGHBOR: 0.75, // harmony break + unique valid neighbour (BROAD lexicon only)
  EDIT_DISTANCE_UNIQUE: 0.72, // BROAD lexicon only: one clearly best valid neighbour, long word
};

export const REASON_SEVERITY: Partial<Record<ReasonCode, Severity>> = {
  TYPO_PAIR: "ERROR",
  HARMONY_SUFFIX: "ERROR",
  SUFFIX_CONSONANT_CONFUSION: "ERROR",
  STEM_VOWEL_MISSING: "ERROR",
  YI_FEMININE_STEM: "ERROR",
  DOUBLED_FINAL_LETTER: "ERROR",
  DIGIT_GLUED: "WARNING",
  MIXED_SCRIPT_LOOKALIKE: "WARNING",
  DIGRAPH_II_FOR_IY: "ERROR",
  HARMONY_VIOLATION_NEIGHBOR: "WARNING",
  EDIT_DISTANCE_UNIQUE: "WARNING",
};

/** User-facing Mongolian explanation per reason. */
export const REASON_MESSAGE_MN: Record<ReasonCode, string> = {
  LEXICON: "Зөв бичигдсэн үг.",
  MORPHOLOGY: "Зөв нөхцөлтэй үг.",
  USER_DICTIONARY: "Хэрэглэгчийн толь.",
  RESEARCH_LEXICON: "Судалгааны толинд бүртгэлтэй үг.",
  PROTECTED_NUMBER: "Тоо, огноо.",
  PROTECTED_URL: "Холбоос.",
  PROTECTED_EMAIL: "И-мэйл хаяг.",
  PROTECTED_LATIN: "Латин бичигтэй үг.",
  PROTECTED_ACRONYM: "Товчилсон үг.",
  PROTECTED_PROPER_NOUN: "Хүний нэр, газрын нэр.",
  PROTECTED_MIXED: "Холимог тэмдэгт.",
  NOT_IN_LEXICON: "Толинд олдсонгүй. Алдаа гэж үзэхгүй.",
  PROPER_NOUN_CANDIDATE: "Нэр байж магадгүй.",
  ACRONYM_UNLISTED: "Товчлол байж магадгүй.",
  UPPERCASE_UNLISTED: "Том үсгээр бичсэн үг.",
  TYPO_PAIR: "Түгээмэл бичгийн алдаа.",
  HARMONY_SUFFIX: "Нөхцөлийн эгшиг үгийн эгшигтэй зохицохгүй байна (эр/эм зохицол).",
  SUFFIX_CONSONANT_CONFUSION: "Нөхцөлийн төгсгөл буруу бичигдсэн байна (д/т).",
  STEM_VOWEL_MISSING: "Үйл үгийн язгуурын эгшиг орхигдсон байна.",
  YI_FEMININE_STEM: "Эм үгэнд «ы» биш «ий» бичнэ.",
  DOUBLED_FINAL_LETTER: "Төгсгөлийн үсэг давхар орсон байна.",
  DIGIT_GLUED: "Үгэнд тоо наалдсан байна.",
  MIXED_SCRIPT_LOOKALIKE: "Кирилл үгэнд латин үсэг орсон байна.",
  DIGRAPH_II_FOR_IY: "«ии» биш «ий» бичнэ.",
  HARMONY_VIOLATION_NEIGHBOR: "Эгшиг зохицохгүй байна; ойролцоо зөв үг олдлоо.",
  EDIT_DISTANCE_UNIQUE: "Толинд байхгүй; ойролцоо зөв үг олдлоо.",
};

/** A suggestion below this confidence is dropped (the issue is still reported). */
export const MIN_SUGGESTION_CONFIDENCE = 0.5;
