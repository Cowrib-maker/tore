import type { LexiconLayer, ReasonCode } from "../core/types";
import type { DiagnosticType, PublicReason } from "./types";

/** Map an internal reason code (+ layer of the evidence) to the public vocabulary. */
export function publicReason(code: ReasonCode, verdict: "VALID" | "MISSPELLED" | "UNKNOWN", layer?: LexiconLayer): PublicReason {
  switch (code) {
    case "LEXICON":
      return layer && layer !== "GENERAL" && layer !== "USER_DEFINED" ? "VALID_DOMAIN_TERM" : "KNOWN_VALID";
    case "USER_DICTIONARY":
    case "RESEARCH_LEXICON":
      return "KNOWN_VALID";
    case "MORPHOLOGY":
      return layer && layer !== "GENERAL" ? "VALID_DOMAIN_TERM" : "VALID_MORPHOLOGY";
    case "PROTECTED_PROPER_NOUN":
      return "KNOWN_PROPER_NOUN";
    case "PROTECTED_ACRONYM":
      return "KNOWN_ABBREVIATION";
    case "HARMONY_SUFFIX":
    case "HARMONY_VIOLATION_NEIGHBOR":
      return "INVALID_HARMONY";
    case "SUFFIX_CONSONANT_CONFUSION":
    case "YI_FEMININE_STEM":
    case "DIGRAPH_II_FOR_IY":
      return "INVALID_SUFFIX";
    case "STEM_VOWEL_MISSING":
    case "DOUBLED_FINAL_LETTER":
    case "DIGIT_GLUED":
    case "MIXED_SCRIPT_LOOKALIKE":
      return "INVALID_FORM";
    case "TYPO_PAIR":
    case "EDIT_DISTANCE_UNIQUE":
      return "LIKELY_TYPO";
    case "NOT_IN_LEXICON":
    case "PROPER_NOUN_CANDIDATE":
    case "ACRONYM_UNLISTED":
    case "UPPERCASE_UNLISTED":
      return "UNKNOWN_WORD";
    default:
      return verdict === "VALID" ? "KNOWN_VALID" : "UNKNOWN_WORD";
  }
}

/** A suffix/harmony finding is MORPHOLOGY; everything else about a single word is SPELLING. */
export function diagnosticTypeOf(code: ReasonCode): DiagnosticType {
  switch (code) {
    case "HARMONY_SUFFIX":
    case "SUFFIX_CONSONANT_CONFUSION":
    case "YI_FEMININE_STEM":
    case "STEM_VOWEL_MISSING":
    case "HARMONY_VIOLATION_NEIGHBOR":
      return "MORPHOLOGY";
    default:
      return "SPELLING";
  }
}
