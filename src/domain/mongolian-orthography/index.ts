export {
  ORTHOGRAPHY_RULE_CATALOG,
  getOrthographyRule,
  orthographyCoachBlock,
  type OrthographyRuleSection,
} from "./catalog";
export {
  BASIC_VOWELS,
  AUXILIARY_VOWELS,
  CONSONANT_LETTERS,
  MONGOLIAN_LETTERS,
  OPTIONAL_VOWEL_CONSONANTS,
  SIGN_LETTERS,
  SPECIAL_CONSONANTS,
  VOWEL_LETTERS,
  VOWEL_REQUIRING_CONSONANTS,
  checkMongolianWord,
  checkVowelHarmony,
  checkYiSpelling,
  classifyVowel,
  expectedLabialFollower,
  extractVowels,
  inferWordGender,
  isMongolianLetter,
  normalizeMongolianWord,
  scanMongolianText,
  type MongolianLetter,
  type OrthographyIssue,
  type OrthographyIssueCode,
  type VowelClass,
} from "./engine";
export {
  findLatinToCyrillicSuggestions,
  isMostlyLatinToken,
  latinTokenToCyrillic,
  type LatinToCyrillicSuggestion,
} from "./latin-to-cyrillic";
export {
  isKnownMongolianWord,
  suggestDictionaryWords,
  dictionarySizeForTests,
} from "./dictionary";
export {
  GENERAL_MONGOLIAN_VOCABULARY,
  LEGAL_MONGOLIAN_VOCABULARY,
  MONGOLIAN_ENTITY_VOCABULARY,
  PRODUCT_CUSTOM_VOCABULARY,
  PRODUCTIVE_SUFFIXES,
} from "./lexicon";
export {
  levenshteinDistance,
} from "./levenshtein";
export {
  applyFeminineYiFix,
  buildOrthographySuggestions,
  replaceAtSpan,
  replaceSuggestedWord,
  type OrthographyCheckResult,
  type OrthographySuggestion,
} from "./suggestions";
