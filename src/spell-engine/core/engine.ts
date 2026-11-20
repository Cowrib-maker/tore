import type {
  CheckRequest,
  CheckResult,
  EngineInfo,
  LanguageEngine,
  LanguageIssue,
} from "../contracts";
import { DeleteIndex } from "../candidates/delete-index";
import { plausibleEdits } from "../candidates/plausible-edits";
import { DEFAULT_RESEARCH_POLICY, type ExternalLexiconProvider, ResearchDataForbiddenError, type ResearchPolicy } from "../research/provider";
import { Lexicon, type LexiconEntry } from "../lexicon/lexicon";
import { DOMAIN_LAYERS, type DataPack } from "../lexicon/pack-schema";
import { UserDictionary } from "../lexicon/user-dictionary";
import { MorphAnalyzer } from "../morphology/analyzer";
import { editCost, rankCandidates } from "../ranking/rank";
import { harmonyOf } from "../morphology/phonology";
import {
  digitGluedRepair,
  digraphIIRepairs,
  doubledFinalRepairs,
  hasStrictHarmonyBreak,
  isHarmonyBreak,
  yiStemIsFeminine,
  lookalikeRepair,
  yiFeminineRepairs,
} from "../rules/rules";
import { lex } from "../tokenizer/lexer";
import { normalizeToken } from "../tokenizer/normalize";
import {
  DEFAULT_MAX_SUGGESTIONS,
  DEFAULT_MIN_DETECTION_CONFIDENCE,
  AMBIGUOUS_SUGGESTION_CONFIDENCE,
  MIN_SUGGESTION_CONFIDENCE,
  REASON_BASE_CONFIDENCE,
  REASON_MESSAGE_MN,
  REASON_SEVERITY,
} from "./policy";
import type {
  AnalysisOptions,
  AnalysisResult,
  CaseShape,
  LexiconLayer,
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
  /**
   * LOCAL-ONLY research lexicon (data class C/D). Honoured only when
   * `environment === "development"`; otherwise construction throws.
   */
  research?: ExternalLexiconProvider;
  environment?: "development" | "production";
  /** Shortest word the research lexicon may declare MISSPELLED (default 4). */
  researchMinLength?: number;
  researchPolicy?: Partial<ResearchPolicy>;
  /**
   * Word-bearing domains to load (default: all bundled). A word valid only in a
   * disabled domain is UNKNOWN, never accused: GENERAL is always on.
   */
  domains?: readonly LexiconLayer[];
};

type Hit = {
  reason: ReasonCode;
  /** Verified-valid replacements, best first (lower-case). */
  repairs: string[];
  detection?: number;
  /** Two or more repairs are about equally plausible: offered as a list, no best claimed. */
  ambiguous?: boolean;
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
  private readonly research?: ExternalLexiconProvider;
  private readonly researchMinLength: number;
  private readonly researchPolicy: ResearchPolicy;
  readonly info: EngineInfo;

  constructor(config: SpellEngineConfig) {
    if (config.research && config.environment !== "development") throw new ResearchDataForbiddenError();
    this.research = config.research;
    this.researchMinLength = config.researchMinLength ?? 4;
    this.researchPolicy = { ...DEFAULT_RESEARCH_POLICY, ...config.researchPolicy };
    this.lexicon = new Lexicon(config.packs, {
      allowResearchData: config.environment === "development",
      layers: config.domains ? [...new Set<LexiconLayer>(["GENERAL", "PROPER_NOUN", "ABBREVIATION", "USER_DEFINED", ...config.domains])] : undefined,
    });
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
    return this.research ? `${this.lexicon.dataPackVersion}+${this.research.id}` : this.lexicon.dataPackVersion;
  }

  private readonly validCache = new Map<string, boolean>();

  /** Accepted by lexicon, user dictionary or morphology. Lexicon/morphology answers are memoised (immutable data). */
  isValid(key: string): boolean {
    if (this.userDictionary.has(key)) return true;
    let v = this.validCache.get(key);
    if (v === undefined) {
      v = this.lexicon.has(key) || this.morphology.analyze(key).parses.length > 0 || (this.research?.accepts(key) ?? false);
      if (this.validCache.size > 200_000) this.validCache.clear();
      this.validCache.set(key, v);
    }
    return v;
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
      case "INITIAL":
        return valid("PROTECTED_INITIAL");
      case "SUFFIX":
        return valid("PROTECTED_SUFFIX");
      case "PHONE":
      case "HASHTAG":
      case "MENTION":
      case "PATH":
      case "CODE":
        return valid("PROTECTED_IDENTIFIER");
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
        // A lone letter is an initial or a fragment: there is nothing to judge, and no suggestion could be defended.
        if (token.kind === "WORD" && Array.from(token.text).length === 1 && token.caseShape !== "LOWER") return valid("PROTECTED_INITIAL");
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
    // An abbreviation entry matches only as written (УИХ, кг): lower-case «нд» is not the acronym НД.
    const entries = this.lexicon.lookup(key).filter((e) => e.layer !== "ABBREVIATION" || e.display === token.text);
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

    if (this.research?.accepts(key)) {
      return { ...base, verdict: "VALID", reasonCode: "RESEARCH_LEXICON", detectionConfidence: 1 };
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
    if (hit && this.researchAllows(key, hit)) {
      const rivals = this.rivalRepairs(key, hit);
      if (rivals.length > 0) return this.misspelled(token, key, { ...hit, repairs: [...new Set([...hit.repairs, ...rivals])].slice(0, 3), ambiguous: true });
      return this.misspelled(token, key, hit);
    }
    return { ...base, verdict: "UNKNOWN", reasonCode: unknownReason, detectionConfidence: 0 };
  }

  private findError(token: Token, key: string, morph: ReturnType<MorphAnalyzer["analyze"]>): Hit | null {
    // 1. curated typo pair (highest evidence)
    const pair = this.typos.get(key);
    if (pair && pair !== key && this.isValid(pair)) return { reason: "TYPO_PAIR", repairs: [pair] };

    // 2. real morphology: known lemma + wrong-gender / д-т-confused suffix
    // A HARMONY violation is an accusation only when the observed suffix really breaks vowel harmony.
    // Short lemmas (аж, ат, ам …) collide with unrelated words (ажээ, амийг), so they never ground an accusation.
    const violations = morph.violations.filter(
      (x) =>
        x.lemma.length >= 3 &&
        (x.kind !== "HARMONY" || isHarmonyBreak(x.observed, x.stemGender)) &&
        // «-оот» vs «-оод»: derived words (холбоот, хараат) look exactly like the slip, so only a hand-curated lemma may ground it.
        // R-DT-LONG-VOWEL-GUARD: «хүрээт», «ширээт», «хөрөнгөт» are the productive adjectival «-т» after a LONG vowel, not a mistyped converb «-ээд»:
        // a long vowel + т is never grounds for a д/т accusation.
        (x.kind !== "CONSONANT_CONFUSION" || (x.entry.conf === "HIGH" && !/(аа|ээ|оо|өө)т$/u.test(key))),
    );
    if (violations.length > 0) {
      const v = violations[0]!;
      let reason: ReasonCode =
        v.kind === "CONSONANT_CONFUSION"
          ? "SUFFIX_CONSONANT_CONFUSION"
          : v.kind === "STEM_VOWEL"
            ? "STEM_VOWEL_MISSING"
            : "HARMONY_SUFFIX";
      if (reason === "HARMONY_SUFFIX" && v.observed.includes("ы") && v.expected.includes("ий")) {
        reason = "YI_FEMININE_STEM";
      }
      return { reason, repairs: [...new Set(violations.flatMap((x) => x.repaired))] };
    }

    // 3. ы-suffix on a feminine stem
    // «ы» is wrong after a FEMININE stem, and after a KNOWN ь-stem (хуул-ын ← хууль → хуулийн). Any other
    // «…ын» is the ordinary masculine genitive and is left alone (зав-ыг, аргал-ын).
    const yiStem = key.endsWith("ын") || key.endsWith("ыг") ? key.slice(0, -2) : key;
    const softLemmaKnown = !this.lexicon.has(yiStem) && this.lexicon.lookup(`${yiStem}ь`).some((e) => e.conf === "HIGH");
    const yiEvidence = yiStemIsFeminine(key, (st) => harmonyOf(st).gender) || softLemmaKnown;
    const yi = yiEvidence ? yiFeminineRepairs(key).filter((r) => this.isValid(r)) : [];
    if (yi.length > 0) return { reason: "YI_FEMININE_STEM", repairs: yi };

    // 4. «ии» for «ий»
    const ii = digraphIIRepairs(key).filter((r) => this.isValid(r));
    if (ii.length > 0) return { reason: "DIGRAPH_II_FOR_IY", repairs: ii };

    // 5. doubled final consonant
    const dbl = doubledFinalRepairs(key).filter((r) => this.isValid(r));
    if (dbl.length > 0) return { reason: "DOUBLED_FINAL_LETTER", repairs: dbl };

    // 6. Strict harmony break + a UNIQUE valid word one VOWEL away (надэд → надад).
    //    A harmony break is positive evidence of a slip, so this is safe on a SEED lexicon.
    // «-гүй» is invariant (дамжихгүй, тусгүй): it is not evidence about the stem's harmony, so it is left out of the test.
    const harmonyKey = key.endsWith("гүй") ? key.slice(0, -3) : key;
    if (key.length >= 4 && harmonyKey.length >= 3 && hasStrictHarmonyBreak(harmonyKey)) {
      // Loanwords legitimately mix vowel genders (архитектур), so only a hand-curated (HIGH) neighbour can ground this accusation.
      const vowelNeighbors = this.nearest(key).filter((n) => n.text.length === key.length && differsByOneVowel(key, n.text) && this.lexicon.lookup(n.text).some((e) => e.conf === "HIGH"));
      if (vowelNeighbors.length === 1) {
        return { reason: "HARMONY_VIOLATION_NEIGHBOR", repairs: [vowelNeighbors[0]!.text] };
      }
    }

    // 7a. Developer build: a broad research lexicon makes absence meaningful.
    if (this.research) return this.findByResearchOracle(key);

    // 7b. Absence from the lexicon is only evidence when the lexicon is BROAD.
    if (!this.lexicon.hasBroadCoverage || key.length < 6) return null;
    const near = this.nearest(key);
    if (near.length === 0) return null;
    const top = near[0]!;
    const second = near[1];
    const unique = !second || second.cost - top.cost >= 0.5;
    if (!unique || top.cost > 1) return null;
    return { reason: "EDIT_DISTANCE_UNIQUE", repairs: near.slice(0, 3).map((n) => n.text) };
  }

  /**
   * Rival repairs. A correction is only defensible as «the» fix if it is the clear best. If another valid word (lexicon OR
   * an inflected form the analyzer accepts) is about as close to what the user typed — алхх → алх / алхах,
   * тавиин → тавийн / тавин, гэраас → гэрээс / гараас — the WORD is still wrong, but we cannot say which fix was meant:
   * the issue is reported with the rivals listed and `suggestionStatus: AMBIGUOUS` (no best, never auto-applied).
   * Only the rule families where two competing hypotheses were observed are checked, each with a small targeted
   * alternative set (cost-bounded), so the gate stays cheap. Curated pairs and structurally unambiguous rules are exempt.
   */
  private rivalRepairs(key: string, hit: Hit): string[] {
    if (!/^[а-яёөү]+$/u.test(key)) return [];
    let alternatives: string[] = [];
    const n = key.length;
    switch (hit.reason) {
      case "DOUBLED_FINAL_LETTER": {
        // algхх: «алх» (drop the repeated х) or «алхах» (a vowel was dropped)?
        for (let i = 1; i < n; i += 1) for (const v of "аэиоуөүяеёюы") alternatives.push(key.slice(0, i) + v + key.slice(i));
        break;
      }
      case "DIGRAPH_II_FOR_IY": {
        // тавиин: «тавийн» (ий typed ии) or «тавин» (a stray и)?
        for (let i = 0; i + 1 < n; i += 1) if (key[i] === "и" && key[i + 1] === "и") alternatives.push(key.slice(0, i) + key.slice(i + 1));
        break;
      }
      case "HARMONY_SUFFIX":
      case "HARMONY_VIOLATION_NEIGHBOR":
      case "SUFFIX_CONSONANT_CONFUSION": {
        // гартэй: wrong SUFFIX vowel (гартай) or wrong STEM vowel (гэртэй)? Swap each vowel for its harmony partner.
        const PARTNER: Record<string, string> = { а: "э", э: "а", о: "ө", ө: "о", у: "ү", ү: "у" };
        for (let i = 0; i < n; i += 1) if (PARTNER[key[i]!]) alternatives.push(key.slice(0, i) + PARTNER[key[i]!] + key.slice(i + 1));
        break;
      }
      default:
        break;
    }
    // Any rule: another lexicon word ONE plausible slip away (deletion, transposition, vowel substitution/insertion) is a rival
    // hypothesis (ахлэн → эхлэн or ахлан; амтт → амт or амтат). Uses the lexicon's delete-index (cheap), never a blind
    // enumeration of edits (that cost ~5 ms per flagged word). Curated pairs are exempt.
    if (hit.reason !== "TYPO_PAIR") for (const n of this.nearest(key)) alternatives.push(n.text);
    // …plus the two cheap slips the delete-index cannot see for INFLECTED words: an adjacent transposition (хамтрна ← хамтран) and a
    // swapped vowel (ахлэн ← ахлан). At most ~25 validity probes, each memoised.
    const VOWELS = "аэоөуүи";
    const transposed = new Set<string>(); // a transposition is a slightly looser rival (+0.25) than a substituted vowel (+0.15)
    // A LONG vowel written with the partner harmony (дугээр ← дугаар / дүгээр, хөөрөх ← хоорох) costs two edits yet is one slip of the same suffix-or-stem
    // hypothesis: it is a rival up to +0.7. (Measured: «дугээр» alone was a wrong CONFIDENT suggestion three times in one synthetic run.)
    const longRun = new Set<string>();
    const RUN_PARTNER: Record<string, string> = { а: "э", э: "а", о: "ө", ө: "о", у: "ү", ү: "у" };
    for (let i = 0; i + 1 < n; i += 1) {
      if (key[i] === key[i + 1] && RUN_PARTNER[key[i]!]) {
        const c = key.slice(0, i) + RUN_PARTNER[key[i]!]!.repeat(2) + key.slice(i + 2);
        alternatives.push(c);
        longRun.add(c);
      }
    }
    for (let i = Math.max(0, n - 7); i < n; i += 1) {
      // only the tail: the stem/suffix seam is where the competing hypotheses live
      if (i + 1 < n && key[i] !== key[i + 1]) {
        const t = key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2);
        alternatives.push(t);
        transposed.add(t);
      }
      if (VOWELS.includes(key[i]!)) for (const v of VOWELS) if (v !== key[i]) alternatives.push(key.slice(0, i) + v + key.slice(i + 1));
    }
    // a rule that itself offers several different repairs (хоногуудээс → …оос / …аас) has no single best
    if (new Set(hit.repairs).size > 1 && hit.reason !== "EDIT_DISTANCE_UNIQUE") return [hit.repairs[1]!];
    const chosen = new Set(hit.repairs);
    alternatives = [...new Set(alternatives)].filter((c) => !chosen.has(c) && c !== key);
    if (alternatives.length === 0) return [];
    const best = Math.min(...hit.repairs.map((r) => editCost(key, r)));
    // Doubled-final competitors must be real HEADWORDS: an inflected form reached by inserting a vowel (сайнн → сайнын) is not a rival.
    // …except the vowel put BETWEEN the two identical final letters: дэмжж → дэмжиж (converb), ордд → ордод are real, inflected rivals (the
    // 2026-10-07 synthetic run showed the headword-only rule made these accusations wrongly confident). сайнн → сайнын is not valid, so no harm.
    const valid = (c: string) =>
      hit.reason === "DOUBLED_FINAL_LETTER" ? this.lexicon.has(c) || (c.length === key.length + 1 && c.slice(0, -2) === key.slice(0, -1) && "аэоөуүи".includes(c[c.length - 2]!) && this.isValid(c)) : this.isValid(c);
    return [...new Set(alternatives.filter((c) => valid(c) && editCost(key, c) <= best + (longRun.has(c) ? 0.7 : transposed.has(c) ? 0.25 : 0.15)))];
  }

  /**
   * Research-mode corroboration for EVERY rule hit: a frequent token is
   * presumed valid, and a repair must dominate it. Curated typo pairs are
   * evidence of their own and are exempt. Without a research lexicon (the
   * shipping configuration) there is no frequency data and nothing changes.
   */
  private researchAllows(key: string, hit: Hit): boolean {
    const rs = this.research;
    if (!rs?.frequencyPerMillion || hit.reason === "TYPO_PAIR") return true;
    const pol = this.researchPolicy;
    if ((rs.nameLikelihood?.(key) ?? 0) > pol.maxNameLikelihood) return false;
    const pm = rs.frequencyPerMillion(key);
    // Idiosyncratic strings are slips; systematic ones (клубын, басс, жазз) are usage or loanword orthography: abstain.
    if (pm > pol.maxTokenPerMillion) return false;
    const best = Math.max(0, ...hit.repairs.map((r) => rs.frequencyPerMillion?.(r) ?? 0));
    return best >= pol.minRatio * Math.max(pm, 0.01);
  }

  /**
   * Detection by absence from a broad research lexicon: the word is accepted
   * nowhere, and at least one edit-1 neighbour IS a valid word. Names and
   * loanwords have no such neighbour, so they stay UNKNOWN.
   */
  private findByResearchOracle(key: string): Hit | null {
    const rs = this.research!;
    const pol = this.researchPolicy;
    if (key.length < this.researchMinLength || !/^[а-яёөү]+$/u.test(key)) return null;
    const pm = rs.frequencyPerMillion?.(key) ?? 0;
    // A frequent word is presumed valid (the dictionary is what is missing), and a likely name is never "corrected".
    if (pm > pol.maxTokenPerMillion) return null;
    if ((rs.nameLikelihood?.(key) ?? 0) > pol.maxNameLikelihood) return null;
    const valid = plausibleEdits(key).filter((c) => this.isValid(c));
    if (valid.length === 0) return null;
    const scored = valid
      .map((c) => {
        const cpm = Math.max(rs.frequencyPerMillion?.(c) ?? 0, pickFreq(this.lexicon.lookup(c)));
        const cost = editCost(key, c);
        return { text: c, cost, cpm, score: pol.costWeight * cost - Math.log10(cpm + 0.01) };
      })
      .sort((a, b) => a.score - b.score || a.text.localeCompare(b.text, "mn"));
    const top = scored[0]!;
    if (top.cost > 1) return null;
    // Noisy channel: the repair must dominate the token by a wide margin.
    if (rs.frequencyPerMillion && top.cpm < pol.minRatio * Math.max(pm, 0.01)) return null;
    const second = scored[1];
    const margin = second ? second.score - top.score : Infinity;
    // An ambiguous best repair is not defensible: detection confidence drops below the policy floor → UNKNOWN.
    const detection = margin >= pol.minMargin ? undefined : 0.6;
    return { reason: "EDIT_DISTANCE_UNIQUE", repairs: scored.slice(0, 3).filter((c) => c.cost <= 1).map((c) => c.text), detection };
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
    return this.lexicon.lookup(c).some((e) => DOMAIN_LAYERS.includes(e.layer) && e.conf !== "LOW");
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
      dataPackVersion: this.dataPackVersion,
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
      // An ambiguous list has no best: every candidate carries the same, deliberately low, confidence.
      const conf = hit.ambiguous ? AMBIGUOUS_SUGGESTION_CONFIDENCE : Math.round(detection * Math.pow(0.7, i) * 100) / 100;
      if (conf >= MIN_SUGGESTION_CONFIDENCE) {
        out.push({
          text: applyCase(token.text, r, token.caseShape),
          confidence: conf,
          reason: hit.reason,
          evidence: [hit.reason === "TYPO_PAIR" ? "curated-pair" : "repair-is-valid-word", ...(hit.ambiguous ? ["ambiguous-with-other-repairs"] : [])],
          autoApplySafe: false,
        });
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
      suggestionStatus: a.verdict !== "MISSPELLED" || suggestions.length === 0 ? "NONE" : suggestions[0]!.evidence?.includes("ambiguous-with-other-repairs") ? "AMBIGUOUS" : "CONFIDENT",
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

function pickFreq(entries: readonly LexiconEntry[]): number {
  return entries.reduce((m, e) => Math.max(m, e.freq), 0);
}

function pickEntry(entries: readonly LexiconEntry[]): LexiconEntry {
  const order = ["GENERAL", "LEGAL", "GOVERNMENT", "BUSINESS", "ACADEMIC", "TECH", "MEDICAL", "PROPER_NOUN", "ABBREVIATION", "USER_DEFINED"];
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
