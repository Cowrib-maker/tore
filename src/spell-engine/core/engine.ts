import type {
  CheckRequest,
  CheckResult,
  EngineInfo,
  LanguageEngine,
  LanguageIssue,
} from "../contracts";
import { DeleteIndex } from "../candidates/delete-index";
import { Lexicon, type LexiconEntry } from "../lexicon/lexicon";
import type { DataPack } from "../lexicon/pack-schema";
import { UserDictionary } from "../lexicon/user-dictionary";
import { MorphAnalyzer } from "../morphology/analyzer";
import { rankCandidates } from "../ranking/rank";
import {
  digitGluedRepair,
  digraphIIRepairs,
  doubledFinalRepairs,
  hasStrictHarmonyBreak,
  lookalikeRepair,
  yiFeminineRepairs,
} from "../rules/rules";
import { lex } from "../tokenizer/lexer";
import { normalizeToken } from "../tokenizer/normalize";
import {
  DEFAULT_MAX_SUGGESTIONS,
  DEFAULT_MIN_DETECTION_CONFIDENCE,
  MIN_SUGGESTION_CONFIDENCE,
  REASON_BASE_CONFIDENCE,
  REASON_MESSAGE_MN,
  REASON_SEVERITY,
} from "./policy";
import type {
  AnalysisOptions,
  AnalysisResult,
  CaseShape,
  ReasonCode,
  SpellIssue,
  Suggestion,
  Token,
  TokenAnalysis,
  WordVerdict,
} from "./types";
import { SPELL_ENGINE_ID, SPELL_ENGINE_VERSION } from "./versions";

export type TypoPair = { wrong: string; right: string };

export type SpellEngineConfig = {
  packs: readonly DataPack[];
  /** Curated, human-reviewed wrong→right pairs (data, not code). */
  typoPairs?: readonly TypoPair[];
  userDictionary?: UserDictionary;
};

type Hit = {
  reason: ReasonCode;
  /** Verified-valid replacements, best first (lower-case). */
  repairs: string[];
  detection?: number;
};

/** Re-apply the original token's casing to a lower-case replacement. */
export function applyCase(original: string, replacement: string, shape: CaseShape): string {
  if (shape === "UPPER") return replacement.toUpperCase();
  if (shape === "TITLE") return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  if (shape === "MIXED") {
    // Preserve a leading capital only; do not guess internal capitals.
    return /^\p{Lu}/u.test(original)
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  }
  return replacement;
}

/**
 * TORE Spell Language Engine V1.
 *
 * Deterministic, offline, no model. Verdict policy (precision over recall):
 *   protected token → VALID;  user/lexicon/morphology → VALID;
 *   a deterministic rule whose repair is itself VALID → MISSPELLED;
 *   anything else → UNKNOWN (never an error, never a replacement).
 */
export class SpellEngineV1 implements LanguageEngine {
  readonly lexicon: Lexicon;
  readonly morphology: MorphAnalyzer;
  readonly userDictionary: UserDictionary;
  private readonly candidates: DeleteIndex;
  private readonly typos = new Map<string, string>();
  readonly info: EngineInfo;

  constructor(config: SpellEngineConfig) {
    this.lexicon = new Lexicon(config.packs);
    this.morphology = new MorphAnalyzer(this.lexicon);
    this.userDictionary = config.userDictionary ?? new UserDictionary();
    this.candidates = new DeleteIndex({
      keys: () => this.lexicon.keys(),
      has: (k) => this.lexicon.has(k),
    });
    for (const p of config.typoPairs ?? []) this.typos.set(normalizeToken(p.wrong), normalizeToken(p.right));
    this.info = {
      id: SPELL_ENGINE_ID,
      version: `${SPELL_ENGINE_VERSION}+${this.lexicon.dataPackVersion}`,
      capabilities: ["SPELLING", "ORTHOGRAPHY"],
      maturity: "MORPHOLOGICAL",
    };
  }

  get engineVersion(): string {
    return SPELL_ENGINE_VERSION;
  }

  get dataPackVersion(): string {
    return this.lexicon.dataPackVersion;
  }

  /** Accepted by lexicon, user dictionary or morphology. */
  isValid(key: string): boolean {
    return (
      this.userDictionary.has(key) ||
      this.lexicon.has(key) ||
      this.morphology.analyze(key).parses.length > 0
    );
  }

  /** Analyse one token. */
  analyzeToken(token: Token): TokenAnalysis & { hit?: Hit } {
    const normalized = normalizeToken(token.text);
    const base = { token, normalizedToken: normalized };
    const valid = (reason: ReasonCode, extra: Partial<TokenAnalysis> = {}) => ({
      ...base,
      verdict: "VALID" as WordVerdict,
      reasonCode: reason,
      detectionConfidence: 1,
      ...extra,
    });
    const unknown = (reason: ReasonCode) => ({
      ...base,
      verdict: "UNKNOWN" as WordVerdict,
      reasonCode: reason,
      detectionConfidence: 0,
    });

    switch (token.kind) {
      case "NUMBER":
        return valid("PROTECTED_NUMBER");
      case "URL":
        return valid("PROTECTED_URL");
      case "EMAIL":
        return valid("PROTECTED_EMAIL");
      case "LATIN":
        return valid("PROTECTED_LATIN");
      case "PUNCT":
      case "SPACE":
        return valid("PROTECTED_MIXED");
      case "ACRONYM": {
        const stem = normalizeToken(token.text.split("-")[0]!);
        if (this.userDictionary.has(stem) || this.userDictionary.has(normalized)) return valid("USER_DICTIONARY");
        const entries = this.lexicon.lookup(stem);
        if (entries.some((e) => e.layer === "ABBREVIATION")) {
          return valid("PROTECTED_ACRONYM", { layer: "ABBREVIATION" });
        }
        if (!token.text.includes("-") && this.lexicon.has(stem)) {
          return valid("LEXICON", { layer: entries[0]!.layer });
        }
        return unknown("ACRONYM_UNLISTED");
      }
      case "MIXED":
        return this.analyzeMixed(token, normalized);
      default:
        return this.analyzeWord(token, normalized);
    }
  }

  private analyzeMixed(token: Token, normalized: string): TokenAnalysis & { hit?: Hit } {
    const base = { token, normalizedToken: normalized };
    const protectedMixed: TokenAnalysis = {
      ...base,
      verdict: "VALID",
      reasonCode: "PROTECTED_MIXED",
      detectionConfidence: 1,
    };
    if (this.userDictionary.has(normalized)) {
      return { ...protectedMixed, reasonCode: "USER_DICTIONARY" };
    }
    // Cyrillic word with trailing digits: хууль2
    const glued = digitGluedRepair(token.text);
    if (glued && /^[Ѐ-ӿ]+$/u.test(glued) && this.isValid(glued)) {
      return this.misspelled(token, normalized, { reason: "DIGIT_GLUED", repairs: [glued] });
    }
    // Latin look-alikes inside a Cyrillic word: only when the repair is VALID
    // and the token really contains Cyrillic letters (otherwise it is an identifier).
    if (/[Ѐ-ӿ]/u.test(token.text) && !/\d/u.test(token.text)) {
      const fixed = lookalikeRepair(token.text);
      if (fixed && this.isValid(fixed)) {
        return this.misspelled(token, normalized, { reason: "MIXED_SCRIPT_LOOKALIKE", repairs: [fixed] });
      }
    }
    return protectedMixed;
  }

  private analyzeWord(token: Token, key: string): TokenAnalysis & { hit?: Hit } {
    const base = { token, normalizedToken: key };
    if (this.userDictionary.has(key)) {
      return { ...base, verdict: "VALID", reasonCode: "USER_DICTIONARY", detectionConfidence: 1, layer: "USER_DEFINED" };
    }
    const entries = this.lexicon.lookup(key);
    if (entries.length > 0) {
      const e = pickEntry(entries);
      const reason: ReasonCode =
        e.layer === "PROPER_NOUN" ? "PROTECTED_PROPER_NOUN" : e.layer === "ABBREVIATION" ? "PROTECTED_ACRONYM" : "LEXICON";
      return { ...base, verdict: "VALID", reasonCode: reason, detectionConfidence: 1, layer: e.layer, lemma: key };
    }
    const morph = this.morphology.analyze(key);
    if (morph.parses.length > 0) {
      const p = morph.parses[0]!;
      return { ...base, verdict: "VALID", reasonCode: "MORPHOLOGY", detectionConfidence: 1, layer: p.entry.layer, lemma: p.lemma };
    }

    const unknownReason: ReasonCode =
      token.caseShape === "TITLE" && !token.sentenceInitial ? "PROPER_NOUN_CANDIDATE" : "NOT_IN_LEXICON";
    // A capitalised word in mid-sentence is most likely a name: never "correct" it.
    if (unknownReason === "PROPER_NOUN_CANDIDATE") {
      return { ...base, verdict: "UNKNOWN", reasonCode: unknownReason, detectionConfidence: 0 };
    }
    if (token.caseShape === "MIXED") {
      return { ...base, verdict: "UNKNOWN", reasonCode: "NOT_IN_LEXICON", detectionConfidence: 0 };
    }

    const hit = this.findError(token, key, morph);
    if (hit) return this.misspelled(token, key, hit);
    return { ...base, verdict: "UNKNOWN", reasonCode: unknownReason, detectionConfidence: 0 };
  }

  private findError(token: Token, key: string, morph: ReturnType<MorphAnalyzer["analyze"]>): Hit | null {
    // 1. curated typo pair (highest evidence)
    const pair = this.typos.get(key);
    if (pair && pair !== key && this.isValid(pair)) return { reason: "TYPO_PAIR", repairs: [pair] };

    // 2. real morphology: known lemma + wrong-gender / д-т-confused suffix
    if (morph.violations.length > 0) {
      const v = morph.violations[0]!;
      let reason: ReasonCode =
        v.kind === "CONSONANT_CONFUSION"
          ? "SUFFIX_CONSONANT_CONFUSION"
          : v.kind === "STEM_VOWEL"
            ? "STEM_VOWEL_MISSING"
            : "HARMONY_SUFFIX";
      if (reason === "HARMONY_SUFFIX" && v.observed.includes("ы") && v.expected.includes("ий")) {
        reason = "YI_FEMININE_STEM";
      }
      return { reason, repairs: [...new Set(morph.violations.flatMap((x) => x.repaired))] };
    }

    // 3. ы-suffix on a feminine stem
    const yi = yiFeminineRepairs(key).filter((r) => this.isValid(r));
    if (yi.length > 0) return { reason: "YI_FEMININE_STEM", repairs: yi };

    // 4. «ии» for «ий»
    const ii = digraphIIRepairs(key).filter((r) => this.isValid(r));
    if (ii.length > 0) return { reason: "DIGRAPH_II_FOR_IY", repairs: ii };

    // 5. doubled final consonant
    const dbl = doubledFinalRepairs(key).filter((r) => this.isValid(r));
    if (dbl.length > 0) return { reason: "DOUBLED_FINAL_LETTER", repairs: dbl };

    // 6. Strict harmony break + a UNIQUE valid word one VOWEL away (надэд → надад).
    //    A harmony break is positive evidence of a slip, so this is safe on a SEED lexicon.
    if (key.length >= 4 && hasStrictHarmonyBreak(key)) {
      const vowelNeighbors = this.nearest(key).filter((n) => n.text.length === key.length && differsByOneVowel(key, n.text));
      if (vowelNeighbors.length === 1) {
        return { reason: "HARMONY_VIOLATION_NEIGHBOR", repairs: [vowelNeighbors[0]!.text] };
      }
    }

    // 7. Absence from the lexicon is only evidence when the lexicon is BROAD.
    if (!this.lexicon.hasBroadCoverage || key.length < 6) return null;
    const near = this.nearest(key);
    if (near.length === 0) return null;
    const top = near[0]!;
    const second = near[1];
    const unique = !second || second.cost - top.cost >= 0.5;
    if (!unique || top.cost > 1) return null;
    return { reason: "EDIT_DISTANCE_UNIQUE", repairs: near.slice(0, 3).map((n) => n.text) };
  }

  private nearest(key: string) {
    const cands = this.candidates.candidates(key).filter((c) => this.isRealCandidate(c));
    return rankCandidates(
      key,
      cands.map((c) => {
        const e = pickEntry(this.lexicon.lookup(c));
        return { text: c, freq: e.freq, layerRank: e.layer === "GENERAL" ? 0 : 1 };
      }),
    );
  }

  private isRealCandidate(c: string): boolean {
    return this.lexicon.lookup(c).some((e) => e.layer === "GENERAL" || e.layer === "LEGAL");
  }

  private misspelled(token: Token, key: string, hit: Hit): TokenAnalysis & { hit?: Hit } {
    const conf = hit.detection ?? REASON_BASE_CONFIDENCE[hit.reason] ?? 0.7;
    return {
      token,
      normalizedToken: key,
      verdict: "MISSPELLED",
      reasonCode: hit.reason,
      detectionConfidence: conf,
      hit,
    };
  }

  /** Full-text analysis. Never throws on any string. */
  analyze(text: string, options: AnalysisOptions = {}): AnalysisResult {
    const minConf = options.minDetectionConfidence ?? DEFAULT_MIN_DETECTION_CONFIDENCE;
    const maxSug = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
    const tokens = lex(text);
    const analyses: TokenAnalysis[] = [];
    const issues: SpellIssue[] = [];
    let words = 0;
    let valid = 0;
    let miss = 0;
    let unk = 0;
    let prot = 0;

    for (const token of tokens) {
      if (token.kind === "SPACE" || token.kind === "PUNCT") continue;
      const a = this.analyzeToken(token);
      const { hit, ...plain } = a;
      analyses.push(plain);
      words += 1;
      if (a.verdict === "VALID") {
        valid += 1;
        if (a.reasonCode.startsWith("PROTECTED_")) prot += 1;
        continue;
      }
      if (a.verdict === "UNKNOWN") {
        unk += 1;
        if (options.reportUnknown) issues.push(this.toIssue(a, [], 0));
        continue;
      }
      // MISSPELLED
      if (a.detectionConfidence < minConf || !hit) {
        // below the policy threshold: demote to UNKNOWN, never report as an error
        plain.verdict = "UNKNOWN";
        plain.reasonCode = "NOT_IN_LEXICON";
        unk += 1;
        continue;
      }
      miss += 1;
      const suggestions = this.suggestionsFor(hit, token, a.detectionConfidence, maxSug);
      issues.push(this.toIssue(a, suggestions, suggestions[0]?.confidence ?? 0));
    }

    return {
      engineVersion: SPELL_ENGINE_VERSION,
      dataPackVersion: this.lexicon.dataPackVersion,
      tokens: analyses,
      issues,
      stats: {
        characterCount: text.length,
        wordCount: words,
        validCount: valid,
        misspelledCount: miss,
        unknownCount: unk,
        protectedCount: prot,
      },
    };
  }

  private suggestionsFor(hit: Hit, token: Token, detection: number, max: number): Suggestion[] {
    const out: Suggestion[] = [];
    hit.repairs.slice(0, max).forEach((r, i) => {
      const conf = Math.round(detection * Math.pow(0.7, i) * 100) / 100;
      if (conf >= MIN_SUGGESTION_CONFIDENCE) {
        out.push({ text: applyCase(token.text, r, token.caseShape), confidence: conf });
      }
    });
    return out;
  }

  private toIssue(a: TokenAnalysis, suggestions: Suggestion[], suggestionConfidence: number): SpellIssue {
    return {
      token: a.token.text,
      normalizedToken: a.normalizedToken,
      verdict: a.verdict === "MISSPELLED" ? "MISSPELLED" : "UNKNOWN",
      reasonCode: a.reasonCode,
      detectionConfidence: a.detectionConfidence,
      suggestions: a.verdict === "MISSPELLED" ? suggestions : [],
      suggestionConfidence: a.verdict === "MISSPELLED" ? suggestionConfidence : 0,
      severity: a.verdict === "MISSPELLED" ? (REASON_SEVERITY[a.reasonCode] ?? "WARNING") : "INFO",
      range: a.token.range,
      autoApplySafe: false,
      message: REASON_MESSAGE_MN[a.reasonCode],
    };
  }

  /** Convenience: verdict for a single word. */
  checkWord(word: string): TokenAnalysis & { issue?: SpellIssue } {
    const r = this.analyze(word, { reportUnknown: false });
    const t = r.tokens[0];
    if (!t) {
      return {
        token: { kind: "WORD", text: word, range: { start: 0, end: word.length }, caseShape: "NONE", sentenceInitial: true },
        normalizedToken: normalizeToken(word),
        verdict: "UNKNOWN",
        reasonCode: "NOT_IN_LEXICON",
        detectionConfidence: 0,
      };
    }
    return { ...t, issue: r.issues[0] };
  }

  /** `LanguageEngine` compatibility (same contract as the v0 engine). */
  async check(request: CheckRequest): Promise<CheckResult> {
    const r = this.analyze(request.text);
    const issues: LanguageIssue[] = r.issues.map((i, n) => ({
      id: `v1-${n}`,
      category: i.reasonCode === "TYPO_PAIR" || i.reasonCode === "EDIT_DISTANCE_UNIQUE" ? "SPELLING" : "ORTHOGRAPHY",
      span: { start: i.range.start, end: i.range.end },
      original: i.token,
      message: i.message,
      ruleIds: [i.reasonCode],
      suggestions: i.suggestions.map((s, k) => ({ text: s.text, rank: k + 1 })),
    }));
    return {
      engine: { id: this.info.id, version: this.info.version },
      issues,
      stats: { characterCount: r.stats.characterCount, wordCount: r.stats.wordCount },
    };
  }
}

function pickEntry(entries: readonly LexiconEntry[]): LexiconEntry {
  const order = ["GENERAL", "LEGAL", "PROPER_NOUN", "ABBREVIATION", "USER_DEFINED"];
  return [...entries].sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer))[0]!;
}

const VOWEL_SET = new Set("аэиоуөүяеёюый");

/** True when the two equal-length words differ in exactly one position, and both letters there are vowels. */
function differsByOneVowel(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      if (!VOWEL_SET.has(a[i]!) || !VOWEL_SET.has(b[i]!)) return false;
      diff += 1;
    }
  }
  return diff === 1;
}
